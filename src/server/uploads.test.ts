import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import sharp from "sharp"
import { createAuth } from "./auth"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import { createUploadsRepository } from "./repositories/uploads"
import { AuthorizationError } from "./session"
import { MODEL_MAX_SIDE, createUploads, detectImageType } from "./uploads"
import type { Auth } from "./auth"
import type { Uploads } from "./uploads"
import { MAX_IMAGE_BYTES } from "@/lib/chat"

let directory: string, dir: string
let auth: Auth
let owner: Headers, admin: Headers
let ownerId: string
let conversations: ReturnType<typeof createConversationsRepository>
let applicationId: string
let uploads: Uploads

const picture = (
  format: "png" | "jpeg" | "webp" = "png",
  width = 40,
  height = 30
) =>
  sharp({ create: { width, height, channels: 3, background: "#0a7" } })
    .toFormat(format)
    .toBuffer()

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-uploads-"))
  dir = join(directory, "uploads")
  const db = openDb(join(directory, "agent6.db"))
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  const sessions: Array<Headers> = []
  for (const [name, role] of [
    ["owner", "client"],
    ["admin", "admin"],
  ] as const) {
    const created = await auth.api.createUser({
      body: {
        name,
        email: `${name}@example.com`,
        password: "some-password",
        role,
      },
    })
    if (name === "owner") ownerId = created.user.id
    const signed = await auth.api.signInEmail({
      body: { email: `${name}@example.com`, password: "some-password" },
      returnHeaders: true,
    })
    sessions.push(
      new Headers({
        cookie: signed.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      })
    )
  }
  ;[owner, admin] = sessions
  conversations = createConversationsRepository(db)
  applicationId = createApplicationsRepository(db).create({
    name: "Customer Portal",
    description: "",
    notes: "",
  }).id
  uploads = createUploads({
    auth,
    conversations,
    uploads: createUploadsRepository(db),
    dir,
  })
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe("type detection", () => {
  it("recognises PNG, JPEG and WebP by their content", async () => {
    expect(detectImageType(await picture("png"))).toBe("image/png")
    expect(detectImageType(await picture("jpeg"))).toBe("image/jpeg")
    expect(detectImageType(await picture("webp"))).toBe("image/webp")
  })
  it("refuses everything else, whatever it is called", async () => {
    for (const bytes of [
      Buffer.from("just some text"),
      Buffer.from("GIF89a\u0001\u0000\u0001\u0000"),
      Buffer.from("%PDF-1.7"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVE"),
      Buffer.alloc(0),
    ])
      expect(detectImageType(bytes)).toBeNull()
  })
  it("rejects a text file renamed to .png, and a file that only starts like a PNG", async () => {
    await expect(
      uploads.add(owner, { name: "notes.png", bytes: Buffer.from("hello") })
    ).rejects.toMatchObject({
      status: 415,
      message: expect.stringMatching(/PNG, JPEG or WebP/),
    })
    await expect(
      uploads.add(owner, {
        name: "broken.png",
        bytes: Buffer.concat([
          (await picture("png")).subarray(0, 8),
          Buffer.from("not an image at all"),
        ]),
      })
    ).rejects.toMatchObject({ status: 415 })
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([])
  })
  it("stores the detected type, not the one the name claims", async () => {
    const image = await uploads.add(owner, {
      name: "photo.png",
      bytes: await picture("jpeg"),
    })
    expect((await uploads.read(owner, image.id)).type).toBe("image/jpeg")
  })
})

describe("size limit", () => {
  it("rejects an oversize picture with a clear message", async () => {
    await expect(
      uploads.add(owner, {
        name: "huge.png",
        bytes: Buffer.concat([
          await picture("png"),
          Buffer.alloc(MAX_IMAGE_BYTES),
        ]),
      })
    ).rejects.toMatchObject({
      status: 413,
      message: "This picture is too large. Pictures can be up to 10 MB.",
    })
  })
  it("keeps the original for display and sends the model a downscaled copy", async () => {
    const bytes = await picture("png", 3000, 1200)
    const image = await uploads.add(owner, { name: "wide.png", bytes })
    expect(image).toMatchObject({ name: "wide.png", width: 3000, height: 1200 })
    expect((await uploads.read(owner, image.id)).bytes.equals(bytes)).toBe(true)
    const { images } = await uploads.modelInput([], [image.id])
    const sent = await sharp(
      Buffer.from(images[0].replace(/^data:image\/png;base64,/, ""), "base64")
    ).metadata()
    expect([sent.width, sent.height]).toEqual([
      MODEL_MAX_SIDE,
      Math.round((1200 * MODEL_MAX_SIDE) / 3000),
    ])
    // A small picture goes to the model as it is.
    const small = await picture("png")
    const same = await uploads.add(owner, { name: "small.png", bytes: small })
    expect((await uploads.modelInput([], [same.id])).images[0]).toBe(
      `data:image/png;base64,${small.toString("base64")}`
    )
  })
})

describe("access rule", () => {
  const add = async (headers = owner) =>
    uploads.add(headers, { name: "error.png", bytes: await picture() })

  it("needs a login", async () => {
    await expect(
      uploads.add(new Headers(), { name: "a.png", bytes: await picture() })
    ).rejects.toBeInstanceOf(AuthorizationError)
    const image = await add()
    await expect(uploads.read(new Headers(), image.id)).rejects.toBeInstanceOf(
      AuthorizationError
    )
  })
  it("serves a picture to the Conversation's owner only, even against an Admin", async () => {
    const unsent = await add()
    await expect(uploads.read(admin, unsent.id)).rejects.toMatchObject({
      status: 404,
    })
    const sent = await add()
    conversations.create(ownerId, applicationId, "What is this?", [sent.id])
    expect((await uploads.read(owner, sent.id)).name).toBe("error.png")
    await expect(uploads.read(admin, sent.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(uploads.read(owner, "missing")).rejects.toMatchObject({
      status: 404,
    })
  })
  it("lets only the user who picked a picture drop it, and only before it is sent", async () => {
    const image = await add()
    await expect(uploads.discard(admin, image.id)).rejects.toMatchObject({
      status: 404,
    })
    await uploads.discard(owner, image.id)
    await expect(uploads.read(owner, image.id)).rejects.toMatchObject({
      status: 404,
    })
    expect(readdirSync(dir)).toEqual([])
    const sent = await add()
    conversations.create(ownerId, applicationId, "Look", [sent.id])
    await expect(uploads.discard(owner, sent.id)).rejects.toMatchObject({
      status: 404,
    })
    expect((await uploads.read(owner, sent.id)).name).toBe("error.png")
  })
})

describe("clean-up", () => {
  it("removes pictures never sent after a day, and files without a record", async () => {
    const sent = await uploads.add(owner, {
      name: "sent.png",
      bytes: await picture(),
    })
    conversations.create(ownerId, applicationId, "Look", [sent.id])
    const unsent = await uploads.add(owner, {
      name: "unsent.png",
      bytes: await picture("png", 2000, 2000),
    })
    const stray = join(dir, "stray")
    await sharp(await picture()).toFile(stray)
    const old = new Date(Date.now() - 2 * 60 * 60_000)
    utimesSync(stray, old, old)
    await uploads.sweep()
    expect(readdirSync(dir).sort()).toEqual(
      [sent.id, unsent.id, `${unsent.id}.model`].sort()
    )
    await uploads.sweep(Date.now() + 25 * 60 * 60_000)
    expect(readdirSync(dir)).toEqual([sent.id])
  })
})
