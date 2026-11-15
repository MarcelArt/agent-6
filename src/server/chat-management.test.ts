import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAuth } from "./auth"
import { createChatManagement } from "./chat-management"
import { createApplicationManagement } from "./application-management"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createConversationsRepository } from "./repositories/conversations"
import sharp from "sharp"
import { createSupportRun } from "./support-agent"
import { createUploads } from "./uploads"
import { createUploadsRepository } from "./repositories/uploads"
import { AuthorizationError } from "./session"
import { REPLY_FAILED, REPLY_LIMIT } from "@/lib/chat"
import type { Auth } from "./auth"
import type { SupportRun } from "./support-agent"
import type { Uploads } from "./uploads"
import type { ensureFresh } from "./repository-sync"
import type { ChatEvent } from "@/lib/chat"

let directory: string
let auth: Auth
let client: Headers, other: Headers
let conversations: ReturnType<typeof createConversationsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let repositories: ReturnType<typeof createRepositoriesRepository>
let applicationId: string, repositoryId: string
let management: ReturnType<typeof createChatManagement>
let uploads: Uploads
let fresh: ReturnType<typeof vi.fn<typeof ensureFresh>>
let run: ReturnType<typeof vi.fn<SupportRun>>
let getScope: (
  headers: Headers,
  id: string
) => ReturnType<
  ReturnType<typeof createApplicationManagement>["getApplicationScope"]
>

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-chat-"))
  const db = openDb(join(directory, "agent6.db"))
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  const sessions: Headers[] = []
  for (const name of ["client", "other"]) {
    await auth.api.createUser({
      body: {
        name,
        email: `${name}@example.com`,
        password: "client-password",
        role: name === "other" ? "admin" : "client",
      },
    })
    const signed = await auth.api.signInEmail({
      body: { email: `${name}@example.com`, password: "client-password" },
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
  ;[client, other] = sessions
  conversations = createConversationsRepository(db)
  uploads = createUploads({
    auth,
    conversations,
    uploads: createUploadsRepository(db),
    dir: join(directory, "uploads"),
  })
  applications = createApplicationsRepository(db)
  repositories = createRepositoriesRepository(db)
  const application = applications.create({
    name: "Customer Portal",
    description: "Invoices and deliveries",
    notes: "Help the billing team.",
  })
  applicationId = application.id
  const repository = repositories.create({
    fullName: "halden/portal",
    trackedBranch: "main",
    description: "Billing screens",
    tags: ["frontend"],
  })
  repositoryId = repository.id
  repositories.markReady(repositoryId, new Date(), "abc123")
  applications.attachRepository(applicationId, repositoryId)
  const clone = join(directory, "repos", repositoryId)
  mkdirSync(clone, { recursive: true })
  writeFileSync(
    join(clone, "billing.ts"),
    'screen("Billing").button("Download invoice")'
  )
  getScope = (headers, id) =>
    createApplicationManagement({
      auth,
      applications,
      repositories,
    }).getApplicationScope(headers, id)
  fresh = vi.fn().mockResolvedValue(repository)
  run = vi.fn<SupportRun>(async ({ history, question, onText }) => {
    onText("Open Billing. ")
    onText("Choose Download invoice.")
    return {
      text: "Open Billing. Choose Download invoice.",
      history: [
        ...history,
        { role: "user", content: question },
        {
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "Open Billing. Choose Download invoice.",
              annotations: [],
            },
          ],
        },
      ],
    }
  })
  management = createChatManagement({
    auth,
    conversations,
    getScope,
    fresh,
    uploads,
    run,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  rmSync(directory, { recursive: true, force: true })
})
async function events(response: Response): Promise<ChatEvent[]> {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as ChatEvent)
}
let shots = 0
const screenshot = async (headers = client) =>
  uploads.add(headers, {
    name: "error.png",
    bytes: await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 200, g: 0, b: shots++ },
      },
    })
      .png()
      .toBuffer(),
  })
const create = () =>
  management.create(client, applicationId, "How do I download an invoice?")

describe("Conversations", () => {
  it("offers every Application but refuses ones without a ready Repository", async () => {
    const unavailable = applications.create({
      name: "Not ready",
      description: "Waiting",
      notes: "Private notes",
    })
    expect(await management.applications(client)).toEqual([
      {
        id: applicationId,
        name: "Customer Portal",
        description: "Invoices and deliveries",
        ready: true,
      },
      {
        id: unavailable.id,
        name: "Not ready",
        description: "Waiting",
        ready: false,
      },
    ])
    await expect(
      management.create(client, unavailable.id, "Help")
    ).rejects.toThrow(/not ready/)
    await expect(
      management.create(client, applicationId, " ")
    ).rejects.toThrow()
    await expect(
      management.create(client, applicationId, "x".repeat(8001))
    ).rejects.toThrow()
  })
  it("refuses reads, starts and retries from anyone except its owner, even an Admin", async () => {
    const conversation = await create()
    await expect(management.get(other, conversation.id)).rejects.toMatchObject({
      status: 404,
    })
    for (const input of [
      { start: true },
      { retry: true },
      { message: "Help" },
    ] as const)
      await expect(
        management.reply(other, conversation.id, input)
      ).rejects.toMatchObject({ status: 404 })
    await expect(
      management.get(new Headers(), conversation.id)
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(run).not.toHaveBeenCalled()
  })
  it("streams and persists messages/history, resumes from a newly opened database, and refreshes once even after a sync failure", async () => {
    fresh.mockRejectedValueOnce(new Error("sync failed"))
    const conversation = await create()
    expect(conversation.title).toBe("How do I download an invoice?")
    const streamed = await events(
      await management.reply(client, conversation.id, { start: true })
    )
    expect(streamed.filter((event) => event.type === "delta")).toHaveLength(2)
    expect(streamed.at(-1)).toMatchObject({
      type: "done",
      conversation: {
        messages: [
          { role: "user" },
          {
            role: "assistant",
            status: "complete",
            content: "Open Billing. Choose Download invoice.",
          },
        ],
      },
    })
    const reopened = createChatManagement({
      auth,
      conversations: createConversationsRepository(
        openDb(join(directory, "agent6.db"))
      ),
      getScope,
      fresh,
      uploads,
      run,
    })
    expect((await reopened.get(client, conversation.id)).messages).toHaveLength(
      2
    )
    await events(
      await reopened.reply(client, conversation.id, {
        message: "And what next?",
      })
    )
    expect(run.mock.calls[1][0].history).toHaveLength(2)
    expect(fresh).toHaveBeenCalledTimes(1)
    expect(fresh).toHaveBeenCalledWith(repositoryId, 180_000)
    expect(
      JSON.stringify(await reopened.get(client, conversation.id))
    ).not.toContain("history")
  })
  it("claims one reply, survives browser cancellation, and makes partial text available to a reload", async () => {
    let finish!: () => void
    let started!: () => void
    const active = new Promise<void>((resolve) => {
      started = resolve
    })
    run.mockImplementationOnce(async ({ onText }) => {
      onText("Open Billing. ")
      started()
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return {
        text: "Open Billing.",
        history: [{ role: "user", content: "question" }],
      }
    })
    const conversation = await create()
    const response = await management.reply(client, conversation.id, {
      start: true,
    })
    await active
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({ status: "pending", content: "Open Billing. " })
    await expect(
      management.reply(client, conversation.id, { start: true })
    ).rejects.toMatchObject({ status: 409 })
    await response.body!.cancel()
    finish()
    await vi.waitFor(async () => {
      expect(
        (await management.get(client, conversation.id)).messages.at(-1)?.status
      ).toBe("complete")
    })
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("saves a friendly timeout and permits a retry without repeating the user message", async () => {
    run.mockImplementationOnce(() => new Promise(() => {}))
    const limited = createChatManagement({
      auth,
      conversations,
      getScope,
      fresh,
      uploads,
      run,
      timeLimitMs: 20,
    })
    const conversation = await create()
    await events(await limited.reply(client, conversation.id, { start: true }))
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({ status: "error", content: REPLY_LIMIT })
    await events(
      await management.reply(client, conversation.id, { retry: true })
    )
    const retried = await management.get(client, conversation.id)
    expect(retried.messages).toHaveLength(2)
    expect(retried.messages.at(-1)?.status).toBe("complete")
    expect(run.mock.calls[1][0].history).toEqual([])
  })
  it("recovers a reply interrupted by a server restart after its lease expires", async () => {
    const conversation = await create()
    const owner = await auth.api.getSession({ headers: client })
    const claim = conversations.begin(conversation.id, owner!.user.id, {
      start: true,
    })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 100_000)
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.status
    ).toBe("error")
    // A late worker must not overwrite the recovery message.
    conversations.finish(conversation.id, claim.assistantId, "late answer", [])
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.status
    ).toBe("error")
  })
  it("does not let an expired worker overwrite a retry", async () => {
    const conversation = await create()
    const owner = await auth.api.getSession({ headers: client })
    const first = conversations.begin(conversation.id, owner!.user.id, {
      start: true,
    })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 100_000)
    const retry = conversations.begin(conversation.id, owner!.user.id, {
      retry: true,
    })
    conversations.savePartial(first.assistantId, "stale text")
    conversations.finish(conversation.id, first.assistantId, "stale answer", [])
    expect(
      conversations.get(conversation.id, owner!.user.id).messages.at(-1)
    ).toMatchObject({ id: retry.assistantId, status: "pending", content: "" })
    conversations.finish(conversation.id, retry.assistantId, "Recovered", [])
  })
  it("keeps saved Conversations when an Admin tries to remove their Application", async () => {
    const conversation = await create()
    await expect(
      createApplicationManagement({ auth, applications, repositories }).remove(
        other,
        applicationId
      )
    ).rejects.toThrow(/saved Conversations/)
    expect((await management.get(client, conversation.id)).application.id).toBe(
      applicationId
    )
  })
  it("shows a Filed Issue under the answer that led to it, without issue details for a Client", async () => {
    run.mockImplementationOnce(({ conversationId, messageId }) => {
      conversations.recordFiledIssue(conversationId, messageId, {
        repository: "halden/portal",
        kind: "code-fix",
        title: "Invoice download fails",
        outcome: "new",
        number: 7,
        url: "https://github.com/halden/portal/issues/7",
        error: null,
      })
      return Promise.resolve({
        text: "The team has been informed.",
        history: [],
      })
    })
    const conversation = await create()
    const done = (
      await events(
        await management.reply(client, conversation.id, { start: true })
      )
    ).at(-1)
    expect(done).toMatchObject({ type: "done" })
    const saved = await management.get(client, conversation.id)
    expect(saved.messages.map((message) => message.reports)).toEqual([
      [],
      [{ id: expect.any(String), outcome: "new" }],
    ])
    expect(JSON.stringify([done, saved])).not.toContain("issues/7")
  })
  it("re-resolves Attachments on a follow-up", async () => {
    const conversation = await create()
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    applications.detachRepository(applicationId, repositoryId)
    await events(
      await management.reply(client, conversation.id, {
        message: "What about now?",
      })
    )
    expect(run.mock.calls[1][0].scope.attachments).toEqual([])
  })
})

describe("Pictures", () => {
  it("keeps pictures on their message, passes them to the agent, and stores references instead of bytes", async () => {
    const first = await screenshot(),
      second = await screenshot()
    run.mockImplementation(async ({ history, question, images }) => ({
      text: "That error means the invoice has no price.",
      history: [
        ...history,
        {
          role: "user",
          content: [
            { type: "input_text", text: question },
            ...(images ?? []).map((image) => ({
              type: "input_image" as const,
              image,
            })),
          ],
        },
      ],
    }))
    const conversation = await management.create(
      client,
      applicationId,
      "What does this mean?",
      [second.id, first.id]
    )
    expect(conversation.messages[0].images).toEqual([second, first])
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    expect(run.mock.calls[0][0].images).toHaveLength(2)
    expect(run.mock.calls[0][0].images?.[0]).toMatch(/^data:image\/png;base64,/)
    const owner = (await auth.api.getSession({ headers: client }))!.user.id
    const saved = conversations.owned(conversation.id, owner).history
    expect(saved).not.toContain("base64")
    expect(saved).toContain(`upload:${second.id}`)
    // A follow-up without pictures still shows the earlier ones to the model.
    await events(
      await management.reply(client, conversation.id, { message: "Sure?" })
    )
    expect(JSON.stringify(run.mock.calls[1][0].history)).toContain(
      "data:image/png;base64,"
    )
    expect(run.mock.calls[1][0].images).toEqual([])
    expect(
      (await management.get(client, conversation.id)).messages[0].images
    ).toEqual([second, first])
  })
  it("accepts a picture without text, and refuses someone else's, a reused or too many pictures", async () => {
    const mine = await screenshot()
    const conversation = await management.create(client, applicationId, "", [
      mine.id,
    ])
    expect(conversation).toMatchObject({
      title: "Picture",
      messages: [{ content: "", images: [mine] }, {}],
    })
    await expect(
      management.create(client, applicationId, "Again", [mine.id])
    ).rejects.toThrow(/attach it again/)
    const theirs = await screenshot(other)
    await expect(
      management.create(client, applicationId, "Look", [theirs.id])
    ).rejects.toThrow(/attach it again/)
    await expect(
      management.create(
        client,
        applicationId,
        "Look",
        Array.from({ length: 5 }, () => "x")
      )
    ).rejects.toThrow(/at most 4 pictures/)
    await expect(
      management.create(client, applicationId, "", [])
    ).rejects.toThrow()
  })
})

describe("OpenAI-compatible Chat Completions", () => {
  function sdk() {
    return createChatManagement({
      auth,
      conversations,
      getScope,
      fresh,
      uploads,
      run: createSupportRun({
        dataDir: directory,
        encryptionKey: "unused",
        authSecret: "unused",
        baseUrl: "http://localhost:3000",
        openaiApiKey: "wrong-key",
        openaiModel: "compatible-model",
        openaiBaseUrl: "http://compatible.test/v1",
      }),
    })
  }
  function completion(delta: unknown, finishReason: string) {
    return new Response(
      `data: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", created: 1, model: "compatible-model", choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", created: 1, model: "compatible-model", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    )
  }
  it("executes a real SDK tool call, streams plain text, and replays tool history on a follow-up", async () => {
    const requests: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(String(url)).toBe("http://compatible.test/v1/chat/completions")
        const body = JSON.parse(init.body as string)
        requests.push(body)
        expect(body.model).toBe("compatible-model")
        if (requests.length === 1)
          return completion(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call-read",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({
                      repositoryId,
                      path: "billing.ts",
                      startLine: 1,
                      endLine: 20,
                    }),
                  },
                },
              ],
            },
            "tool_calls"
          )
        expect(JSON.stringify(body.messages)).toContain("Download invoice")
        return completion(
          {
            role: "assistant",
            content: "Open Billing. Choose Download invoice.",
          },
          "stop"
        )
      })
    )
    const service = sdk(),
      conversation = await service.create(
        client,
        applicationId,
        "How do I download an invoice?"
      )
    const response = await events(
      await service.reply(client, conversation.id, { start: true })
    )
    expect(response).toContainEqual({
      type: "delta",
      text: "Open Billing. Choose Download invoice.",
    })
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)?.status
    ).toBe("complete")
    await events(
      await service.reply(client, conversation.id, {
        message: "Is that the same button?",
      })
    )
    expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[2].messages)).toContain("call-read")
    expect(JSON.stringify(requests[0].messages)).toContain(
      "Help the billing team."
    )
    expect(JSON.stringify(requests[0].messages)).toContain("frontend")
  })
  it("sends pictures as image input, and answers the text alone when the model refuses pictures", async () => {
    const requests: Array<{ messages: Array<{ content: unknown }> }> = []
    let vision = true
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        requests.push(body)
        if (!vision && JSON.stringify(body.messages).includes("image_url"))
          return new Response(
            JSON.stringify({
              error: { message: "This model does not support image input." },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        return completion(
          { role: "assistant", content: "The invoice has no price." },
          "stop"
        )
      })
    )
    const service = sdk()
    const seen = await service.create(client, applicationId, "What is this?", [
      (await screenshot()).id,
    ])
    await events(await service.reply(client, seen.id, { start: true }))
    expect(requests[0].messages.at(-1)?.content).toEqual([
      { type: "text", text: "What is this?" },
      {
        type: "image_url",
        image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) },
      },
    ])
    expect((await service.get(client, seen.id)).messages.at(-1)).toMatchObject({
      status: "complete",
      imagesUnread: false,
    })

    vision = false
    requests.length = 0
    const unseen = await service.create(client, applicationId, "And this?", [
      (await screenshot()).id,
    ])
    await events(await service.reply(client, unseen.id, { start: true }))
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1].messages)).not.toContain("image_url")
    expect(JSON.stringify(requests[1].messages)).toContain("And this?")
    expect(
      (await service.get(client, unseen.id)).messages.at(-1)
    ).toMatchObject({
      status: "complete",
      content: "The invoice has no price.",
      imagesUnread: true,
    })
    // The follow-up is not refused again: the pictures left the history.
    await events(await service.reply(client, unseen.id, { message: "Sure?" }))
    expect(requests).toHaveLength(3)
    expect(
      (await service.get(client, unseen.id)).messages.at(-1)
    ).toMatchObject({ status: "complete", imagesUnread: false })
  })
  it("turns a wrong API key into a saved friendly error, then retries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Incorrect API key wrong-key; internal stack",
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockImplementation(async () =>
        completion({ role: "assistant", content: "Open Billing." }, "stop")
      )
    vi.stubGlobal("fetch", fetcher)
    const service = sdk(),
      conversation = await create()
    const output = await events(
      await service.reply(client, conversation.id, { start: true })
    )
    expect(JSON.stringify(output)).not.toMatch(
      /wrong-key|stack|invalid_api_key/
    )
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({ status: "error", content: REPLY_FAILED })
    await events(await service.reply(client, conversation.id, { retry: true }))
    expect((await service.get(client, conversation.id)).messages).toHaveLength(
      2
    )
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)?.status
    ).toBe("complete")
  })
  it("stops a model that keeps calling tools at the turn limit", async () => {
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        completion(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `call-${++calls}`,
                type: "function",
                function: {
                  name: "list_directory",
                  arguments: JSON.stringify({ repositoryId, path: "." }),
                },
              },
            ],
          },
          "tool_calls"
        )
      )
    )
    const service = sdk(),
      conversation = await create()
    await events(await service.reply(client, conversation.id, { start: true }))
    expect(calls).toBe(12)
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({ status: "error", content: REPLY_LIMIT })
  })
})
