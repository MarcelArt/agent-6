import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { getConfig } from "./config"
import { requireSession } from "./session"
import {
  ConversationError,
  createConversationsRepository,
} from "./repositories/conversations"
import { createUploadsRepository } from "./repositories/uploads"
import type { AgentInputItem } from "@openai/agents"
import type { Auth } from "./auth"
import type { ConversationsRepository } from "./repositories/conversations"
import type { UploadsRepository } from "./repositories/uploads"
import type { ChatImage, ImageType } from "@/lib/chat"
import {
  IMAGE_NOT_SUPPORTED,
  IMAGE_TOO_LARGE,
  MAX_IMAGE_BYTES,
} from "@/lib/chat"

/** Longest side of the copy sent to the model. Screenshot text stays readable at this size. */
export const MODEL_MAX_SIDE = 1568
const UNSENT_KEPT_MS = 24 * 60 * 60_000
const SWEEP_EVERY_MS = 60 * 60_000
/** How a picture is referenced in stored history, instead of its bytes. */
const REFERENCE = "upload:"
const IMAGE_GONE = "[A picture that is no longer available.]"

export class UploadError extends Error {
  constructor(
    description: string,
    public readonly status = 400
  ) {
    super(description)
  }
}

/** The image type by its leading bytes; the file name and the browser's claim are ignored. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const starts = (signature: Array<number>, offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte)
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png"
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp"
  return null
}

const formats: Record<ImageType, { format: string; extension: string }> = {
  "image/png": { format: "png", extension: "png" },
  "image/jpeg": { format: "jpeg", extension: "jpg" },
  "image/webp": { format: "webp", extension: "webp" },
}

export function createUploads(
  deps: {
    auth?: Auth
    uploads?: UploadsRepository
    conversations?: ConversationsRepository
    /** Defaults to `DATA_DIR/uploads`. */
    dir?: string
  } = {}
) {
  const uploads = deps.uploads ?? createUploadsRepository()
  const conversations = deps.conversations ?? createConversationsRepository()
  const dir = deps.dir ?? join(getConfig().dataDir, "uploads")
  const user = (headers: Headers) =>
    requireSession({ auth: deps.auth, headers })
  const gone = () => new UploadError("This picture is not available.", 404)
  let swept = 0

  async function removeFiles(id: string) {
    await Promise.all(
      [id, `${id}.model`].map((file) => rm(join(dir, file), { force: true }))
    )
  }
  /** Removes pictures that were picked but never sent, and files without a record. */
  async function sweep(now = Date.now()) {
    swept = now
    for (const { id } of uploads.unsentBefore(new Date(now - UNSENT_KEPT_MS)))
      if (uploads.removeUnsent(id)) await removeFiles(id)
    const known = new Set(uploads.ids().map(({ id }) => id))
    for (const file of await readdir(dir).catch(() => [])) {
      if (known.has(file.replace(/\.model$/, ""))) continue
      // An upload in progress writes its files before its record.
      const { mtimeMs } = await stat(join(dir, file))
      if (mtimeMs < now - SWEEP_EVERY_MS)
        await rm(join(dir, file), { force: true })
    }
  }
  /** The picture as the model gets it, as a data URL; null when its file is gone. */
  async function forModel(id: string) {
    const found = uploads.find(id)?.upload
    if (!found) return null
    try {
      const bytes = await readFile(
        join(dir, found.modelType ? `${id}.model` : id)
      )
      return `data:${found.modelType ?? found.type};base64,${bytes.toString("base64")}`
    } catch {
      return null
    }
  }

  return {
    sweep,
    /** Checks and stores a picked picture. It joins a message when that message is sent. */
    async add(
      headers: Headers,
      file: { name: string; bytes: Uint8Array }
    ): Promise<ChatImage> {
      const owner = await user(headers)
      if (file.bytes.length > MAX_IMAGE_BYTES)
        throw new UploadError(IMAGE_TOO_LARGE, 413)
      const type = detectImageType(file.bytes)
      if (!type) throw new UploadError(IMAGE_NOT_SUPPORTED, 415)
      let model: { bytes: Buffer; type: ImageType } | undefined
      let width: number, height: number
      try {
        const meta = await sharp(file.bytes).metadata()
        if (meta.format !== formats[type].format) throw new Error("Mismatch")
        const turned = (meta.orientation ?? 1) > 1
        ;({ width, height } = turned ? meta.autoOrient : meta)
        // The model gets a smaller, upright PNG or JPEG; the original is kept for display.
        if (
          turned ||
          type === "image/webp" ||
          Math.max(width, height) > MODEL_MAX_SIDE
        ) {
          const resized = sharp(file.bytes).rotate().resize({
            width: MODEL_MAX_SIDE,
            height: MODEL_MAX_SIDE,
            fit: "inside",
            withoutEnlargement: true,
          })
          const photo =
            type === "image/jpeg" || (type === "image/webp" && !meta.hasAlpha)
          model = {
            bytes: await (
              photo ? resized.jpeg({ quality: 85 }) : resized.png()
            ).toBuffer(),
            type: photo ? "image/jpeg" : "image/png",
          }
        }
      } catch {
        // Right signature, but not a readable image.
        throw new UploadError(IMAGE_NOT_SUPPORTED, 415)
      }
      const id = randomUUID()
      const name =
        file.name
          .replace(/^.*[\\/]/, "")
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001f\u007f"]/g, "")
          .trim()
          .slice(0, 120) || `picture.${formats[type].extension}`
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, id), file.bytes)
      if (model) await writeFile(join(dir, `${id}.model`), model.bytes)
      uploads.create({
        id,
        userId: owner.id,
        name,
        type,
        size: file.bytes.length,
        width,
        height,
        modelType: model?.type ?? null,
        createdAt: new Date(),
      })
      if (Date.now() - swept > SWEEP_EVERY_MS) void sweep().catch(() => {})
      return { id, name, width, height }
    },
    /**
     * The original picture. Once sent it follows its Conversation's access
     * rule; before that only the user who picked it may read it.
     */
    async read(headers: Headers, id: string) {
      const reader = await user(headers)
      const found = uploads.find(id)
      if (!found) throw gone()
      if (found.conversationId) {
        try {
          conversations.readable(
            found.conversationId,
            reader.id,
            reader.role === "admin"
          )
        } catch (error) {
          if (error instanceof ConversationError) throw gone()
          throw error
        }
      } else if (found.upload.userId !== reader.id) throw gone()
      try {
        return {
          bytes: await readFile(join(dir, id)),
          type: found.upload.type,
          name: found.upload.name,
        }
      } catch {
        throw gone()
      }
    },
    /** Drops a picked picture that was removed before sending. Sent pictures stay. */
    async discard(headers: Headers, id: string) {
      const owner = await user(headers)
      const found = uploads.find(id)
      if (found?.upload.userId !== owner.id || !uploads.removeUnsent(id))
        throw gone()
      await removeFiles(id)
    },
    /**
     * Prepares a run's input. Stored history references pictures by id; the
     * model needs their bytes. `store` turns the run's history back into
     * references so the bytes are not saved again with every Conversation.
     */
    async modelInput(history: Array<AgentInputItem>, imageIds: Array<string>) {
      // Keyed by content: two identical pictures share one reference.
      const references = new Map<string, string>()
      const urls = new Map<string, string | null>()
      async function load(id: string) {
        if (!urls.has(id)) {
          const url = await forModel(id)
          urls.set(id, url)
          if (url) references.set(url, REFERENCE + id)
        }
        return urls.get(id) ?? null
      }
      const stored = new Set<string>()
      mapImages(history, (image) => {
        if (image.startsWith(REFERENCE)) stored.add(image)
        return image
      })
      for (const reference of stored)
        await load(reference.slice(REFERENCE.length))
      const images: Array<string> = []
      for (const id of imageIds) {
        const url = await load(id)
        if (url) images.push(url)
      }
      return {
        history: mapImages(history, (image) =>
          image.startsWith(REFERENCE)
            ? (urls.get(image.slice(REFERENCE.length)) ?? null)
            : image
        ),
        images,
        store: (result: Array<AgentInputItem>) =>
          mapImages(result, (image) => references.get(image) ?? image),
      }
    },
  }
}
export type Uploads = ReturnType<typeof createUploads>

/** Rewrites the pictures in user messages; `null` replaces one with a note that it is gone. */
function mapImages(
  history: Array<AgentInputItem>,
  change: (image: string) => string | null
): Array<AgentInputItem> {
  return history.map((item) => {
    if (!("role" in item) || item.role !== "user") return item
    if (typeof item.content === "string") return item
    return {
      ...item,
      content: item.content.map((part) => {
        if (part.type !== "input_image" || typeof part.image !== "string")
          return part
        const image = change(part.image)
        return image === null
          ? { type: "input_text" as const, text: IMAGE_GONE }
          : { ...part, image }
      }),
    }
  })
}
