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
import { createSupportRun, supportInstructions } from "./support-agent"
import { createSettingsRepository } from "./repositories/settings"
import { INDONESIAN_AGENT_MESSAGES } from "@/lib/preferred-language"
import { createUploads } from "./uploads"
import { createUploadsRepository } from "./repositories/uploads"
import { AuthorizationError } from "./session"
import * as issueTools from "./issue-tools"
import type { DecisionConfig } from "./decision-config"
import {
  GUARDRAIL_FAILED,
  GUARDRAIL_REFUSED,
  REPLY_FAILED,
  REPLY_LIMIT,
} from "@/lib/chat"
import type { Auth } from "./auth"
import type { SupportRun } from "./support-agent"
import type { GuardrailClassifier } from "./guardrail"
import type { Uploads } from "./uploads"
import type { ensureFresh } from "./repository-sync"
import type { ChatEvent } from "@/lib/chat"

let directory: string
let auth: Auth
let client: Headers, other: Headers
let conversations: ReturnType<typeof createConversationsRepository>
let settings: ReturnType<typeof createSettingsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let repositories: ReturnType<typeof createRepositoriesRepository>
let applicationId: string, repositoryId: string
let management: ReturnType<typeof createChatManagement>
let uploads: Uploads
let fresh: ReturnType<typeof vi.fn<typeof ensureFresh>>
let run: ReturnType<typeof vi.fn<SupportRun>>
let classify: ReturnType<typeof vi.fn<GuardrailClassifier>>
let getScope: (
  headers: Headers,
  id: string
) => ReturnType<
  ReturnType<typeof createApplicationManagement>["getApplicationScope"]
>

function startSignal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

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
  settings = createSettingsRepository(db)
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
  classify = vi.fn<GuardrailClassifier>().mockResolvedValue(true)
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
    settings,
    auth,
    conversations,
    getScope,
    classify,
    fresh,
    uploads,
    run,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
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
    expect(conversation.title).toBe("Application support")
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
      classify,
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
  it("keeps a disconnected investigation alive beyond 90 seconds and exposes safe activity on reload", async () => {
    const started = startSignal()
    let finish!: () => void
    run.mockImplementationOnce(async ({ onActivity, signal }) => {
      onActivity?.({
        id: "query-1",
        name: "query_database",
        input: "private SQL and credentials",
        status: "started",
      })
      started.resolve()
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      expect(signal.aborted).toBe(false)
      onActivity?.({
        id: "query-1",
        name: "query_database",
        input: "private SQL and credentials",
        status: "complete",
      })
      return { text: "Investigation finished.", history: [] }
    })
    const conversation = await create()
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
      ],
    })
    try {
      const response = await management.reply(client, conversation.id, {
        start: true,
      })
      await started.promise
      await response.body!.cancel()
      await vi.advanceTimersByTimeAsync(180_000)
      const reloaded = await management.get(client, conversation.id)
      expect(reloaded.messages.at(-1)?.status).toBe("pending")
      expect(reloaded.messages.at(-1)?.activity).toContainEqual(
        expect.objectContaining({
          label: "Checking application data",
          status: "started",
        })
      )
      expect(JSON.stringify(reloaded)).not.toContain("private SQL")
      finish()
      await vi.waitFor(async () =>
        expect(
          (await management.get(client, conversation.id)).messages.at(-1)
            ?.status
        ).toBe("complete")
      )
    } finally {
      vi.useRealTimers()
    }
  })
  it("only lets the owner stop a run, cancels its signal and ignores late output", async () => {
    const started = startSignal()
    let finish!: () => void
    let signal!: AbortSignal
    run.mockImplementationOnce(async (input) => {
      signal = input.signal
      started.resolve()
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      input.onText("Late text")
      return { text: "Late answer", history: [] }
    })
    const conversation = await create()
    const response = await management.reply(client, conversation.id, {
      start: true,
    })
    await started.promise
    await expect(management.stop(other, conversation.id)).rejects.toMatchObject(
      { status: 404 }
    )
    expect(signal.aborted).toBe(false)
    const stopped = await management.stop(client, conversation.id)
    expect(stopped.messages.at(-1)).toMatchObject({
      status: "error",
      content: "Investigation stopped. You can try again.",
    })
    expect(signal.aborted).toBe(true)
    await events(response)
    finish()
    await Promise.resolve()
    await events(
      await management.reply(client, conversation.id, { retry: true })
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.content
    ).not.toContain("Late")
  })
  it("streams public activity without exposing tool inputs", async () => {
    run.mockImplementationOnce(async ({ onActivity }) => {
      onActivity?.({
        id: "read-1",
        name: "read_file",
        input: "secret-path",
        status: "started",
      })
      onActivity?.({
        id: "read-1",
        name: "read_file",
        input: "secret-path",
        status: "complete",
      })
      return { text: "Done", history: [] }
    })
    const conversation = await create()
    const streamed = await events(
      await management.reply(client, conversation.id, { start: true })
    )
    expect(streamed).toContainEqual(
      expect.objectContaining({
        type: "activity",
        activity: expect.objectContaining({
          label: "Reading application code",
          status: "started",
        }),
      })
    )
    expect(streamed).toContainEqual(
      expect.objectContaining({
        type: "activity",
        activity: expect.objectContaining({
          label: "Reading application code",
          status: "complete",
        }),
      })
    )
    expect(JSON.stringify(streamed)).not.toContain("secret-path")
  })
  it("saves a friendly timeout and permits a retry without repeating the user message", async () => {
    const started = startSignal()
    run.mockImplementationOnce(() => {
      started.resolve()
      return new Promise(() => {})
    })
    const limited = createChatManagement({
      settings,
      auth,
      conversations,
      getScope,
      classify,
      fresh,
      uploads,
      run,
      timeLimitMs: 20,
    })
    const conversation = await create()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const response = await limited.reply(client, conversation.id, {
      start: true,
    })
    await started.promise
    await vi.advanceTimersByTimeAsync(20)
    await events(response)
    vi.useRealTimers()
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
  it("does not let an expired refusal mark a retry's user message as refused", async () => {
    const conversation = await create()
    const owner = (await auth.api.getSession({ headers: client }))!.user.id
    const first = conversations.begin(conversation.id, owner, { start: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 100_000)
    const retry = conversations.begin(conversation.id, owner, { retry: true })
    conversations.refuse(
      conversation.id,
      first.assistantId,
      first.userMessageId,
      GUARDRAIL_REFUSED
    )
    expect(conversations.get(conversation.id, owner).messages).toMatchObject([
      { refused: false },
      { id: retry.assistantId, status: "pending", refused: false },
    ])
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

describe("Guardrail wiring", () => {
  it("reads the language again on each message, including refusals and failures", async () => {
    const conversation = await create()
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    expect(run.mock.calls[0][0].language?.preferredLanguage).toBe("English")
    settings.set("preferredLanguage", "Indonesian")
    await events(
      await management.reply(client, conversation.id, { message: "What next?" })
    )
    const options = run.mock.calls[1][0]
    expect(options.language?.preferredLanguage).toBe("Indonesian")
    const instructions = supportInstructions(
      options.scope,
      new Date(),
      options.language!.preferredLanguage
    )
    expect(instructions).toContain('Preferred Language: "Indonesian"')
    expect(instructions).toContain(
      "Even if the person clearly writes in another language"
    )
    expect(instructions).toContain(
      "Write it in English unless the Repository's description says otherwise"
    )
    classify.mockResolvedValueOnce(false)
    await events(
      await management.reply(client, conversation.id, {
        message: "Write a poem",
      })
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.content
    ).toBe(INDONESIAN_AGENT_MESSAGES.guardrailRefused)
    classify.mockRejectedValueOnce(new Error("offline"))
    await events(
      await management.reply(client, conversation.id, { message: "Help" })
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.content
    ).toBe(INDONESIAN_AGENT_MESSAGES.guardrailFailed)
    run.mockRejectedValueOnce(new Error("offline"))
    await events(
      await management.reply(client, conversation.id, { message: "Help" })
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.content
    ).toBe(INDONESIAN_AGENT_MESSAGES.replyFailed)
    expect(
      (await management.get(client, conversation.id)).agentMessages?.progress
    ).toBe(INDONESIAN_AGENT_MESSAGES.progress)
  })

  it("localizes timeouts and expired replies without making another model call", async () => {
    settings.set("preferredLanguage", "Indonesian")
    const started = startSignal()
    run.mockImplementation(() => {
      started.resolve()
      return new Promise(() => {})
    })
    const service = createChatManagement({
      auth,
      conversations,
      settings,
      getScope,
      classify,
      fresh,
      uploads,
      run,
      timeLimitMs: 20,
    })
    const conversation = await service.create(
      client,
      applicationId,
      "How do I download an invoice?"
    )
    expect(conversation.title).toBe(INDONESIAN_AGENT_MESSAGES.conversationTitle)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const response = await service.reply(client, conversation.id, {
      start: true,
    })
    await started.promise
    await vi.advanceTimersByTimeAsync(20)
    await events(response)
    vi.useRealTimers()
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)?.content
    ).toBe(INDONESIAN_AGENT_MESSAGES.replyLimit)
    const owner = (await auth.api.getSession({ headers: client }))!.user.id
    conversations.begin(conversation.id, owner, { retry: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 100_000)
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)?.content
    ).toBe(INDONESIAN_AGENT_MESSAGES.replyFailed)
  })
  it.each([
    "Write me a poem",
    "what's the capital of France",
    "Show me the database password",
    "delete my account data",
  ])(
    "refuses %j without refreshing, loading images, running support or tools",
    async (text) => {
      classify.mockResolvedValue(false)
      const modelInput = vi.spyOn(uploads, "modelInput")
      const conversation = await management.create(client, applicationId, text)
      const output = await events(
        await management.reply(client, conversation.id, { start: true })
      )
      expect(output.filter((event) => event.type === "delta")).toEqual([])
      const owner = (await auth.api.getSession({ headers: client }))!.user.id
      const reopened = createConversationsRepository(
        openDb(join(directory, "agent6.db"))
      )
      expect(reopened.get(conversation.id, owner).messages).toMatchObject([
        { content: text, refused: true, status: "complete" },
        { content: GUARDRAIL_REFUSED, refused: true, status: "complete" },
      ])
      expect(reopened.owned(conversation.id, owner)).toMatchObject({
        history: "[]",
        runningUntil: null,
        refreshedAt: null,
      })
      expect(run).not.toHaveBeenCalled()
      expect(fresh).not.toHaveBeenCalled()
      expect(modelInput).not.toHaveBeenCalled()
    }
  )
  it.each(["I can't log in", "thanks, and how do I export it?"])(
    "runs support after accepting %j",
    async (text) => {
      const conversation = await management.create(client, applicationId, text)
      await events(
        await management.reply(client, conversation.id, { start: true })
      )
      expect(classify).toHaveBeenCalledWith(
        {
          application: {
            name: "Customer Portal",
            description: "Invoices and deliveries",
          },
          recent: [],
          message: text,
          hasImages: false,
        },
        expect.any(AbortSignal)
      )
      expect(run).toHaveBeenCalledTimes(1)
      expect(
        (await management.get(client, conversation.id)).messages.every(
          (message) => !message.refused
        )
      ).toBe(true)
    }
  )
  it("waits for the classifier before any support work", async () => {
    let decide!: (allowed: boolean) => void
    classify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          decide = resolve
        })
    )
    const conversation = await create()
    const response = await management.reply(client, conversation.id, {
      start: true,
    })
    await vi.waitFor(() => expect(classify).toHaveBeenCalledTimes(1))
    expect(fresh).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    decide(false)
    await events(response)
    expect(run).not.toHaveBeenCalled()
  })
  it("fails closed on model errors, saves a refusal, and allows a new message", async () => {
    classify.mockRejectedValueOnce(new Error("secret API key, host and stack"))
    const conversation = await create()
    const output = await events(
      await management.reply(client, conversation.id, { start: true })
    )
    expect(JSON.stringify(output)).not.toContain("secret API key")
    expect(
      (await management.get(client, conversation.id)).messages
    ).toMatchObject([
      { refused: true },
      { status: "complete", refused: true, content: GUARDRAIL_FAILED },
    ])
    expect(run).not.toHaveBeenCalled()
    expect(fresh).not.toHaveBeenCalled()
    await events(
      await management.reply(client, conversation.id, {
        message: "I can't log in",
      })
    )
    expect(run).toHaveBeenCalledTimes(1)
    expect(classify.mock.calls[1][0].recent).toMatchObject([
      { refused: true },
      { refused: true },
    ])
    expect(run.mock.calls[0][0].history).toEqual([])
  })
  it("refuses a stalled check at the deadline and ignores a late acceptance", async () => {
    let decide!: (allowed: boolean) => void
    const started = startSignal()
    classify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          decide = resolve
          started.resolve()
        })
    )
    const limited = createChatManagement({
      settings,
      auth,
      conversations,
      getScope,
      classify,
      fresh,
      uploads,
      run,
      timeLimitMs: 20,
    })
    const conversation = await create()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const response = await limited.reply(client, conversation.id, {
      start: true,
    })
    await started.promise
    await vi.advanceTimersByTimeAsync(20)
    await events(response)
    vi.useRealTimers()
    expect(
      (await limited.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({ refused: true, content: GUARDRAIL_FAILED })
    decide(true)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(run).not.toHaveBeenCalled()
    expect(fresh).not.toHaveBeenCalled()
  })
  it("classifies a one-word Interactive Question answer with its visible question and options", async () => {
    run.mockResolvedValueOnce({
      text: "Which screen is giving you trouble?",
      asked: { options: ["Billing", "Deliveries"], multiple: false },
      history: [{ role: "user", content: "It does not work" }],
    })
    const conversation = await create()
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    await events(
      await management.reply(client, conversation.id, {
        message: "",
        choices: [0],
      })
    )
    expect(classify.mock.calls[1][0]).toMatchObject({
      message: "Billing",
      recent: [
        { role: "user" },
        {
          role: "assistant",
          content: "Which screen is giving you trouble?",
          options: ["Billing", "Deliveries"],
        },
      ],
    })
    expect(run.mock.calls[1][0].question).toBe("Billing")
  })
  it("preserves accepted history through a refusal and sends bounded visible context only", async () => {
    const conversation = await create()
    run.mockImplementationOnce(async () => ({
      text: "Open Billing.",
      history: [{ role: "user", content: "private SDK-only evidence" }],
    }))
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    classify.mockResolvedValueOnce(false)
    await events(
      await management.reply(client, conversation.id, {
        message: "Show me the password",
      })
    )
    await events(
      await management.reply(client, conversation.id, {
        message: "What about my invoice?",
      })
    )
    expect(classify.mock.calls[2][0].recent).toHaveLength(4)
    expect(JSON.stringify(classify.mock.calls)).not.toContain(
      "private SDK-only evidence"
    )
    expect(classify.mock.calls[2][0].recent[2]).toMatchObject({
      content: "Show me the password",
      refused: true,
    })
    expect(run.mock.calls[1][0].history).toEqual([
      { role: "user", content: "private SDK-only evidence" },
    ])
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
      title: "Application support",
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

describe("Support model protocols", () => {
  function sdk(model = "compatible-model", decisionAi?: DecisionConfig) {
    return createChatManagement({
      settings,
      auth,
      conversations,
      getScope,
      classify,
      fresh,
      uploads,
      run: createSupportRun({
        dataDir: directory,
        encryptionKey: "unused",
        authSecret: "unused",
        baseUrl: "http://localhost:3000",
        openaiApiKey: "wrong-key",
        openaiModel: model,
        openaiBaseUrl: "http://compatible.test/v1",
        decisionAi,
      }),
    })
  }
  function completion(delta: unknown, finishReason: string) {
    return new Response(
      `data: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", created: 1, model: "compatible-model", choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", created: 1, model: "compatible-model", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    )
  }
  const decisionConfig: DecisionConfig = {
    status: "configured",
    provider: "typesafe",
    apiKey: "decision-only-key",
    model: "jev-latest",
    baseUrl: "http://decision.test/v1",
    minProbability: 0.7,
    minMargin: 0.15,
  }
  it("runs advisory selection after the Guardrail and reads the toggle afresh on each reply", async () => {
    let decisions = 0
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        const body = JSON.parse(init!.body as string)
        if (String(url).includes("decision.test")) {
          expect(classify).toHaveBeenCalled()
          expect(init?.headers).toMatchObject({
            Authorization: "Bearer decision-only-key",
          })
          decisions++
          return Response.json({
            answers: { r0: { type: "noul", noul: 0.95 } },
          })
        }
        if (decisions)
          expect(JSON.stringify(body.messages)).toContain(
            "Prioritize recommended resources"
          )
        return completion(
          { content: "Open Billing to find your invoice." },
          "stop"
        )
      })
    const conversation = await create()
    const service = sdk("compatible-model", decisionConfig)
    settings.set("decisionAiEnabled", "false")
    await events(await service.reply(client, conversation.id, { start: true }))
    expect(decisions).toBe(0)
    settings.set("decisionAiEnabled", "true")
    const streamed = await events(
      await service.reply(client, conversation.id, {
        message: "Where is Billing?",
      })
    )
    expect(decisions).toBe(1)
    expect(JSON.stringify(streamed)).not.toContain("decision-only-key")
    const audit = conversations.audit(conversation.id)
    expect(audit.activities.some((a) => a.name === "decision_resources")).toBe(
      true
    )
    expect(JSON.stringify(audit.activities)).not.toContain("decision-only-key")
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it("continues the regular support run when the decision provider fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("decision.test")
        ? new Response("private provider error", { status: 503 })
        : completion({ content: "Open Billing to find your invoice." }, "stop")
    )
    const conversation = await create()
    await events(
      await sdk("compatible-model", decisionConfig).reply(
        client,
        conversation.id,
        { start: true }
      )
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({
      status: "complete",
      content: "Open Billing to find your invoice.",
    })
    const audit = conversations.audit(conversation.id)
    expect(JSON.stringify(audit.activities)).toContain("HTTP 503")
    expect(JSON.stringify(audit.activities)).not.toContain(
      "private provider error"
    )
  })
  it("returns conflicting fix advice for review and allows the agent to retain its evidence-supported choice", async () => {
    const file = vi.fn().mockResolvedValue({ reported: true })
    vi.spyOn(issueTools, "createIssueTools").mockReturnValue({
      findExisting: vi.fn().mockResolvedValue({ issues: [] }),
      file,
    })
    let supportCalls = 0,
      faultCalls = 0
    const proposal = {
      repositoryId,
      kind: "code-fix",
      title: "Invoice calculation fails",
      userExperience: "Invoice is incorrect",
      findings: "billing.ts:1 calculates a wrong total",
      potentialFix: "Correct the calculation",
      existingIssueNumber: null,
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const body = JSON.parse(init!.body as string)
      if (String(url).includes("decision.test")) {
        if (body.questions.classification) {
          faultCalls++
          return Response.json({
            answers: {
              classification: {
                type: "choice",
                choice: "data-fix",
                confidence: 0.9,
                probabilities: {
                  "data-fix": 0.9,
                  "code-fix": 0.04,
                  "no-fix": 0.03,
                  "insufficient-evidence": 0.03,
                },
              },
              destination: {
                type: "choice",
                choice: "r0",
                confidence: 0.9,
                probabilities: { r0: 0.95, unknown: 0.05 },
              },
            },
          })
        }
        return Response.json({ answers: { r0: { type: "noul", noul: 0.9 } } })
      }
      supportCalls++
      if (supportCalls === 2) {
        expect(file).not.toHaveBeenCalled()
        expect(JSON.stringify(body.messages)).toContain("decisionAdvice")
      }
      if (supportCalls <= 2)
        return completion(
          {
            tool_calls: [
              {
                index: 0,
                id: `file-${supportCalls}`,
                type: "function",
                function: {
                  name: "file_issue",
                  arguments: JSON.stringify(proposal),
                },
              },
            ],
          },
          "tool_calls"
        )
      return completion({ content: "The team has been informed." }, "stop")
    })
    const conversation = await create()
    await events(
      await sdk("compatible-model", decisionConfig).reply(
        client,
        conversation.id,
        { start: true }
      )
    )
    expect(faultCalls).toBe(1)
    expect(file).toHaveBeenCalledExactlyOnceWith(proposal)
    expect(
      conversations
        .audit(conversation.id)
        .activities.some((a) => a.name === "decision_fault")
    ).toBe(true)
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)?.status
    ).toBe("complete")
  })
  it("uses Responses for gpt-6.1-sol tools and replays local history on follow-up", async () => {
    const requests: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        requests.push(body)
        if (String(url).endsWith("/chat/completions"))
          return new Response(
            JSON.stringify({
              error: {
                message:
                  "Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions.",
                param: "reasoning_effort",
              },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        expect(String(url)).toBe("http://compatible.test/v1/responses")
        expect(body.store).toBe(false)
        expect(body).not.toHaveProperty("previous_response_id")
        expect(body).not.toHaveProperty("conversation")
        expect(body.include).toContain("reasoning.encrypted_content")
        const text = "Open Billing to find your invoice."
        const output =
          requests.length === 1
            ? [
                {
                  id: "reason-1",
                  type: "reasoning",
                  summary: [],
                  encrypted_content: "opaque-private-reasoning",
                },
                {
                  id: "tool-1",
                  type: "function_call",
                  call_id: "read-1",
                  name: "read_file",
                  arguments: JSON.stringify({
                    repositoryId,
                    path: "billing.ts",
                    startLine: 1,
                    endLine: 20,
                  }),
                  status: "completed",
                },
              ]
            : [
                {
                  id: `msg-${requests.length}`,
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [{ type: "output_text", text, annotations: [] }],
                },
              ]
        const events = [
          ...(requests.length === 1
            ? []
            : [
                {
                  type: "response.output_text.delta",
                  delta: text,
                  item_id: `msg-${requests.length}`,
                  output_index: 0,
                  content_index: 0,
                },
              ]),
          {
            type: "response.completed",
            response: {
              id: `resp-${requests.length}`,
              object: "response",
              status: "completed",
              output,
              usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
            },
          },
        ]
        return new Response(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
          { headers: { "Content-Type": "text/event-stream" } }
        )
      })
    )
    const conversation = await create()
    const service = sdk("gpt-6.1-sol")
    const streamed = await events(
      await service.reply(client, conversation.id, { start: true })
    )
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({
      status: "complete",
      content: "Open Billing to find your invoice.",
    })
    expect(streamed).toContainEqual({
      type: "delta",
      text: "Open Billing to find your invoice.",
    })
    expect(JSON.stringify(streamed)).not.toContain("opaque-private-reasoning")
    await events(
      await service.reply(client, conversation.id, { message: "And then?" })
    )
    expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[2].input)).toContain("function_call_output")
    expect(JSON.stringify(requests[2].input)).toContain(
      "opaque-private-reasoning"
    )
  })
  it("finishes investigations that require more than twelve model turns", async () => {
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requests++
        if (requests <= 13)
          return completion(
            {
              tool_calls: [
                {
                  index: 0,
                  id: `call-${requests}`,
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
        return completion(
          { content: "Found the answer after checking the code." },
          "stop"
        )
      })
    )
    const conversation = await create()
    await events(await sdk().reply(client, conversation.id, { start: true }))
    expect(requests).toBe(14)
    expect(
      (await management.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({
      status: "complete",
      content: "Found the answer after checking the code.",
    })
  })
  it("builds an Indonesian run with a translated title and Interactive Question while keeping developer issues in English", async () => {
    settings.set("preferredLanguage", "Indonesian")
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        expect(body.messages[0].content).toContain(
          'Preferred Language: "Indonesian"'
        )
        expect(body.messages[0].content).toContain(
          "Write it in English unless the Repository's description says otherwise"
        )
        const name =
          requests++ === 0 ? "set_conversation_title" : "ask_question"
        const args =
          name === "set_conversation_title"
            ? { title: "Masalah tagihan" }
            : {
                question: "Layar mana yang bermasalah?",
                options: ["Tagihan", "Pengiriman", "Yang lain"],
                multiple: false,
              }
        return completion(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `call-${requests}`,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          "tool_calls"
        )
      })
    )
    const service = sdk()
    const conversation = await service.create(
      client,
      applicationId,
      "It does not work"
    )
    await events(await service.reply(client, conversation.id, { start: true }))
    expect(await service.get(client, conversation.id)).toMatchObject({
      title: "Masalah tagihan",
      messages: [
        { role: "user" },
        {
          content: "Layar mana yang bermasalah?",
          question: {
            options: ["Tagihan", "Pengiriman"],
            otherOption: "Yang lain",
            answer: null,
          },
        },
      ],
    })
    settings.set("preferredLanguage", "English")
    // A previously asked question keeps its original catch-all label.
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)?.question
        ?.otherOption
    ).toBe("Yang lain")
  })
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
    expect(
      conversations
        .audit(conversation.id)
        .activities.filter((item) => item.name === "read_file")
    ).toMatchObject([
      {
        name: "read_file",
        status: "complete",
        input: expect.stringContaining("billing.ts"),
      },
    ])
    expect(
      JSON.stringify(await service.get(client, conversation.id))
    ).not.toContain("read_file")
  })
  it("keeps tool activity when the next model request fails, including across a retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        completion(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "failed-run-call",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: JSON.stringify({
                    repositoryId,
                    path: "missing.ts",
                    startLine: 1,
                    endLine: 20,
                  }),
                },
              },
            ],
          },
          "tool_calls"
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "secret credential", type: "server_error" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockImplementation(async () =>
        completion(
          { role: "assistant", content: "Please try Billing." },
          "stop"
        )
      )
    vi.stubGlobal("fetch", fetcher)
    const service = sdk(),
      conversation = await create()
    await events(await service.reply(client, conversation.id, { start: true }))
    const failed = conversations.audit(conversation.id)
    expect(
      failed.activities.filter(
        (item) => item.name === "read_file" || item.name === "Agent run"
      )
    ).toMatchObject([
      {
        name: "read_file",
        status: "error",
        input: expect.stringContaining("missing.ts"),
      },
      { name: "Agent run", status: "error" },
    ])
    expect(JSON.stringify(failed)).not.toContain("secret credential")
    await events(await service.reply(client, conversation.id, { retry: true }))
    const retried = conversations.audit(conversation.id)
    expect(
      retried.activities.filter(
        (item) => item.name === "read_file" || item.name === "Agent run"
      )
    ).toHaveLength(2)
    expect(retried.activities[0].messageId).toBe(retried.messages.at(-1)?.id)
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
  it("ends the turn on ask_question, saves the question, and sends the answer back with the tool history", async () => {
    const requests: Array<{ messages: Array<Record<string, unknown>> }> = []
    const ask = (id: string, args: unknown) =>
      completion(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id,
              type: "function",
              function: {
                name: "ask_question",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        "tool_calls"
      )
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(init.body as string))
        // An unusable question is handed back to the model, not shown.
        if (requests.length === 1)
          return ask("call-bad", {
            question: "Which screen?",
            options: ["Billing", "Something else"],
            multiple: false,
          })
        if (requests.length === 2)
          return ask("call-ask", {
            question: "Which screen is this about?",
            options: ["Billing", "Deliveries", "Other"],
            multiple: false,
          })
        return completion(
          { role: "assistant", content: "Open Billing." },
          "stop"
        )
      })
    )
    const service = sdk()
    const conversation = await service.create(
      client,
      applicationId,
      "It doesn't work"
    )
    await events(await service.reply(client, conversation.id, { start: true }))
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1].messages)).toContain("must not be one")
    expect(
      (await service.get(client, conversation.id)).messages.at(-1)
    ).toMatchObject({
      status: "complete",
      content: "Which screen is this about?",
      question: {
        options: ["Billing", "Deliveries"],
        multiple: false,
        answer: null,
      },
    })
    await events(
      await service.reply(client, conversation.id, {
        message: "",
        choices: [0],
      })
    )
    expect(requests).toHaveLength(3)
    const sent = requests[2].messages
    expect(sent.at(-1)).toMatchObject({ role: "user", content: "Billing" })
    expect(sent.at(-2)).toMatchObject({
      role: "tool",
      tool_call_id: "call-ask",
    })
    expect(
      (await service.get(client, conversation.id)).messages.map(
        (message) => message.content
      )
    ).toEqual([
      "It doesn't work",
      "Which screen is this about?",
      "Billing",
      "Open Billing.",
    ])
  })
})

describe("Interactive Questions", () => {
  const asking = (asked: { options: Array<string>; multiple: boolean }) =>
    run.mockImplementationOnce(async ({ history, question }) => ({
      text: "What looked wrong?",
      asked,
      history: [...history, { role: "user", content: question }],
    }))
  const reopen = () =>
    createChatManagement({
      auth,
      conversations: createConversationsRepository(
        openDb(join(directory, "agent6.db"))
      ),
      getScope,
      classify,
      fresh,
      uploads,
      run,
    })
  const options = ["The map didn't load", "The date was missing", "Not sure"]
  async function ask(multiple: boolean) {
    asking({ options, multiple })
    const conversation = await create()
    await events(
      await management.reply(client, conversation.id, { start: true })
    )
    return conversation.id
  }

  it("keeps an open question open and answerable after a reload from the database", async () => {
    const id = await ask(false)
    const reopened = reopen()
    expect((await reopened.get(client, id)).messages.at(-1)).toMatchObject({
      role: "assistant",
      status: "complete",
      content: "What looked wrong?",
      question: { options, multiple: false, answer: null },
    })
    await events(
      await reopened.reply(client, id, { message: "", choices: [1] })
    )
    const messages = (await reopen().get(client, id)).messages
    expect(messages[1].question?.answer).toEqual({ choices: [1], other: false })
    expect(messages[2]).toMatchObject({
      role: "user",
      content: "The date was missing",
    })
    expect(messages[3]).toMatchObject({ role: "assistant", status: "complete" })
    expect(messages[3].question).toBeUndefined()
    expect(run.mock.calls[1][0].question).toBe("The date was missing")
  })
  it("saves several choices with a typed answer, and a typed message alone as Something else", async () => {
    const id = await ask(true)
    await events(
      await management.reply(client, id, {
        message: "and the page was slow",
        choices: [1, 0, 1],
      })
    )
    let messages = (await reopen().get(client, id)).messages
    expect(messages[1].question?.answer).toEqual({
      choices: [0, 1],
      other: true,
    })
    expect(messages[2].content).toBe(
      "The map didn't load, The date was missing\nand the page was slow"
    )
    const typed = await ask(false)
    await events(
      await management.reply(client, typed, { message: "The price was wrong" })
    )
    messages = (await reopen().get(client, typed)).messages
    expect(messages[1].question?.answer).toEqual({ choices: [], other: true })
    expect(messages[2].content).toBe("The price was wrong")
  })
  it("refuses choices that do not fit the question, and a second answer", async () => {
    const id = await ask(false)
    for (const choices of [[3], [0, 1]])
      await expect(
        management.reply(client, id, { message: "", choices })
      ).rejects.toMatchObject({ status: 400 })
    expect((await management.get(client, id)).messages).toHaveLength(2)
    await events(
      await management.reply(client, id, { message: "", choices: [0] })
    )
    await expect(
      management.reply(client, id, { message: "", choices: [1] })
    ).rejects.toMatchObject({ status: 409 })
    const messages = (await management.get(client, id)).messages
    expect(messages).toHaveLength(4)
    expect(messages[1].question?.answer).toEqual({ choices: [0], other: false })
  })
  it("lets the agent ask only a few times in a row", async () => {
    const id = await ask(false)
    for (let turn = 0; turn < 3; turn++) {
      asking({ options, multiple: false })
      await events(
        await management.reply(client, id, { message: "", choices: [2] })
      )
    }
    expect(run.mock.calls.map(([call]) => call.mayAsk)).toEqual([
      true,
      true,
      true,
      false,
    ])
    await events(
      await management.reply(client, id, { message: "", choices: [2] })
    )
    await events(await management.reply(client, id, { message: "Thanks" }))
    expect(run.mock.calls.at(-1)![0].mayAsk).toBe(true)
  })
})
