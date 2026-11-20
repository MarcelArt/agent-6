import { execFileSync } from "node:child_process"
import { createHmac } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:https"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { createFakeGitHub } from "./fake-github"
import { createGitHubIssues } from "./github"
import { decrypt } from "./secrets"
import { createTicketDecisions } from "./ticket-management"
import {
  DestinationError,
  isPublicAddress,
  postWebhook,
  validWebhookUrl,
} from "./webhook-destination"
import { RETRY_DELAYS_MS, createWebhookDispatcher } from "./webhook-dispatcher"
import { WebhookError, createWebhookManagement } from "./webhook-management"
import { newSigningSecret, signedHeaders } from "./webhook-signature"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createAuditRepository } from "./repositories/audit"
import { createConversationsRepository } from "./repositories/conversations"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createTicketsRepository } from "./repositories/tickets"
import { createWebhooksRepository } from "./repositories/webhooks"
import type { Auth } from "./auth"
import type { PostResult } from "./webhook-destination"
import type { Db } from "./repositories/db"
import type { WebhookInput } from "@/lib/webhooks"
import { webhookEventSchema, webhookTestEventSchema } from "@/lib/webhooks"

const KEY = Buffer.alloc(32, 3).toString("base64")
const PUBLIC = async () => [{ address: "203.0.114.10", family: 4 }]

let dir: string, db: Db, auth: Auth, admin: Headers, client: Headers
let clientId: string, adminId: string
let clock: Date
let billing: string, portal: string, repositoryId: string
let tickets: ReturnType<typeof createTicketsRepository>
let conversations: ReturnType<typeof createConversationsRepository>
let webhooks: ReturnType<typeof createWebhooksRepository>
let management: ReturnType<typeof createWebhookManagement>
let sent: Array<{ url: string; body: string; headers: Record<string, string> }>
let answer: () => Promise<PostResult>

async function signIn(email: string, password: string) {
  const signed = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  return new Headers({
    cookie: signed.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  })
}

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = KEY
  dir = mkdtempSync(join(tmpdir(), "agent6-webhooks-"))
  db = openDb(join(dir, "agent6.db"))
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  for (const role of ["admin", "client"] as const) {
    const created = await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
    if (role === "client") clientId = created.user.id
    else adminId = created.user.id
  }
  admin = await signIn("admin@example.com", "admin-password")
  client = await signIn("client@example.com", "client-password")
  clock = new Date("2026-11-20T10:00:00.000Z")
  const applications = createApplicationsRepository(db)
  billing = applications.create({
    name: "Billing",
    description: "",
    notes: "",
  }).id
  portal = applications.create({
    name: "Portal",
    description: "",
    notes: "",
  }).id
  repositoryId = createRepositoriesRepository(db).create({
    fullName: "halden/billing",
    trackedBranch: "main",
    tags: [],
    description: "",
  }).id
  applications.attachRepository(billing, repositoryId)
  applications.attachRepository(portal, repositoryId)
  tickets = createTicketsRepository(db)
  conversations = createConversationsRepository(db)
  webhooks = createWebhooksRepository(db)
  sent = []
  answer = async () => ({ kind: "response", status: 204 })
  management = createWebhookManagement({
    auth,
    webhooks,
    applications,
    audit: createAuditRepository(db),
    now: () => clock,
    resolve: PUBLIC,
    send: async (url, body, headers) => {
      sent.push({ url, body, headers })
      return answer()
    },
    kick: () => {},
  })
})

afterEach(() => {
  db.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

const input = (overrides: Partial<WebhookInput> = {}): WebhookInput => ({
  name: "Review queue",
  url: "https://hooks.example.com/agent6",
  enabled: true,
  eventTypes: [
    "ticket.created",
    "ticket.accepted",
    "ticket.declined",
    "github.issue.created",
  ],
  allApplications: true,
  applicationIds: [],
  ...overrides,
})

function dispatcher() {
  return createWebhookDispatcher({
    webhooks,
    now: () => clock,
    send: async (url, body, headers) => {
      sent.push({ url, body, headers })
      return answer()
    },
  })
}

function ticket(applicationId = billing) {
  const conversation = conversations.create(clientId, applicationId, "It fails")
  const created = tickets.create({
    conversationId: conversation.id,
    messageId: conversation.messages.at(-1)!.id,
    repositoryId,
    repository: "halden/billing",
    kind: "data-fix",
    title: "Invoice fails",
    body: "Delivery 8812 has no price. Call +62 812 3456 7890.",
    summary: "Your invoice cannot be made.",
    targetIssueNumber: null,
    possibleDuplicateOf: null,
  })
  if (typeof created === "string") throw new Error(created)
  return created.id
}

const deliveries = () =>
  db.$client
    .prepare(
      "select d.*, e.type from webhook_delivery d join webhook_event e on e.id = d.event_id order by e.type"
    )
    .all() as Array<{
    id: string
    status: string
    attempts: number
    type: string
    last_result: string | null
    next_attempt_at: number | null
    event_id: string
  }>

/** Verifies as a receiver following /docs/webhooks would. */
function verifies(secret: string, delivery: (typeof sent)[number]) {
  const signed = `${delivery.headers["webhook-id"]}.${delivery.headers["webhook-timestamp"]}.${delivery.body}`
  const expected = createHmac(
    "sha256",
    Buffer.from(secret.slice("whsec_".length), "base64")
  )
    .update(signed)
    .digest("base64")
  return delivery.headers["webhook-signature"]
    .split(" ")
    .includes(`v1,${expected}`)
}

describe("Webhook Subscriptions", () => {
  it("lets only Admins manage them, and shows the signing secret only on creation and rotation", async () => {
    await expect(management.create(client, input())).rejects.toThrow(
      "Only an Admin"
    )
    const { id, secret } = await management.create(admin, input())
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    const stored = db.$client
      .prepare("select encrypted_secret from webhook_subscription")
      .get() as { encrypted_secret: string }
    expect(stored.encrypted_secret).not.toContain(secret.slice(6))
    expect(decrypt(stored.encrypted_secret, KEY)).toBe(secret)
    expect(JSON.stringify(await management.get(admin, id))).not.toContain(
      secret.slice(6)
    )
  })

  it("accepts only public HTTPS destinations", async () => {
    for (const url of [
      "http://hooks.example.com/a",
      "https://user:pass@hooks.example.com/a",
      "https://hooks.example.com/a#x",
      "https://localhost/a",
      "https://intranet/a",
      "https://127.0.0.1/a",
      "https://10.1.2.3/a",
      "https://169.254.169.254/latest",
      "https://[::1]/a",
      "https://[fd00::1]/a",
      "https://[::ffff:10.0.0.1]/a",
    ])
      expect(() => validWebhookUrl(url), url).toThrow(DestinationError)
    expect(validWebhookUrl(" https://hooks.example.com/a?x=1 ")).toBe(
      "https://hooks.example.com/a?x=1"
    )
    for (const address of ["8.8.8.8", "2606:4700:4700::1111"])
      expect(isPublicAddress(address)).toBe(true)
    for (const address of [
      "100.64.1.1",
      "192.168.1.1",
      "fe80::1",
      "2001:db8::1",
      "0.0.0.0",
      "224.0.0.1",
    ])
      expect(isPublicAddress(address), address).toBe(false)

    // A name that resolves somewhere private is refused when saved.
    const privateDns = createWebhookManagement({
      auth,
      webhooks,
      now: () => clock,
      applications: createApplicationsRepository(db),
      audit: createAuditRepository(db),
      resolve: async () => {
        throw new DestinationError("private", "not-public")
      },
    })
    await expect(privateDns.create(admin, input())).rejects.toMatchObject({
      field: "url",
    })
    await expect(
      management.create(admin, input({ eventTypes: [] }))
    ).rejects.toMatchObject({ field: "eventTypes" })
    await expect(
      management.create(admin, input({ allApplications: false }))
    ).rejects.toMatchObject({ field: "applicationIds" })
  })

  it("sends a signed synthetic test that verifies as documented", async () => {
    const { id, secret } = await management.create(
      admin,
      input({ enabled: false })
    )
    const result = await management.sendTest(admin, id)
    expect(result).toEqual({ delivered: true, status: 204, result: "HTTP 204" })
    const [test] = sent
    expect(webhookTestEventSchema.parse(JSON.parse(test.body)).type).toBe(
      "webhook.test"
    )
    expect(test.headers["webhook-id"]).toBe(JSON.parse(test.body).id)
    expect(test.headers["webhook-timestamp"]).toBe(
      String(clock.getTime() / 1000)
    )
    expect(verifies(secret, test)).toBe(true)
    expect(verifies(newSigningSecret(), test)).toBe(false)
    expect(
      verifies(secret, { ...test, body: test.body.replace("test", "tset") })
    ).toBe(false)
    answer = async () => ({ kind: "response", status: 401 })
    expect((await management.sendTest(admin, id)).delivered).toBe(false)
  })

  it("signs with both secrets during a rotation overlap, and only the new one after replacing", async () => {
    const { id, secret: first } = await management.create(admin, input())
    const { secret: second } = await management.rotateSecret(
      admin,
      id,
      "overlap"
    )
    await management.sendTest(admin, id)
    expect(verifies(first, sent[0]) && verifies(second, sent[0])).toBe(true)
    expect((await management.get(admin, id))!.previousSecretExpiresAt).toBe(
      clock.getTime() + 24 * 3_600_000
    )
    clock = new Date(clock.getTime() + 25 * 3_600_000)
    await management.sendTest(admin, id)
    expect([verifies(first, sent[1]), verifies(second, sent[1])]).toEqual([
      false,
      true,
    ])
    const { secret: third } = await management.rotateSecret(
      admin,
      id,
      "replace"
    )
    await management.sendTest(admin, id)
    expect([verifies(second, sent[2]), verifies(third, sent[2])]).toEqual([
      false,
      true,
    ])
  })
})

describe("events and deliveries", () => {
  it("queues full, redacted snapshots for matching subscriptions in the Ticket's transaction", async () => {
    const { secret } = await management.create(
      admin,
      input({
        allApplications: false,
        applicationIds: [billing],
        eventTypes: ["ticket.created"],
      })
    )
    await management.create(admin, input({ name: "Disabled", enabled: false }))
    const id = ticket(billing)
    ticket(portal)
    const [delivery] = deliveries()
    expect(deliveries()).toHaveLength(1)
    await dispatcher().runOnce()
    expect(sent).toHaveLength(1)
    const event = webhookEventSchema.parse(JSON.parse(sent[0].body))
    expect(event).toMatchObject({
      type: "ticket.created",
      version: 1,
      occurredAt: expect.any(String),
      data: {
        ticket: {
          id,
          kind: "data-fix",
          status: "pending",
          title: "Invoice fails",
          summary: "Your invoice cannot be made.",
          declineReason: null,
          application: { id: billing, name: "Billing" },
          repository: { id: repositoryId, fullName: "halden/billing" },
          targetIssue: null,
          filedIssue: null,
        },
      },
    })
    expect(event.data.ticket.description).toContain("[redacted phone]")
    // No personal identities or Conversation content.
    expect(sent[0].body).not.toMatch(/client@example\.com|"client"|It fails/)
    expect(sent[0].headers["webhook-id"]).toBe(event.id)
    expect(verifies(secret, sent[0])).toBe(true)
    expect(deliveries()[0]).toMatchObject({
      id: delivery.id,
      status: "succeeded",
      attempts: 1,
    })
  })

  it("retries transient failures with backoff within 24 hours, keeping the event ID and body", async () => {
    await management.create(admin, input({ eventTypes: ["ticket.created"] }))
    ticket()
    const run = dispatcher()
    answer = async () => ({ kind: "response", status: 503 })
    await run.runOnce()
    expect(deliveries()[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      next_attempt_at: clock.getTime() + RETRY_DELAYS_MS[0],
    })
    // Not due yet.
    await run.runOnce()
    expect(sent).toHaveLength(1)
    clock = new Date(clock.getTime() + 5_000)
    answer = async () => ({ kind: "timeout" })
    await run.runOnce()
    clock = new Date(clock.getTime() + 5 * 60_000)
    answer = async () => ({ kind: "response", status: 200 })
    await run.runOnce()
    expect(deliveries()[0]).toMatchObject({ status: "succeeded", attempts: 3 })
    expect(new Set(sent.map((item) => item.headers["webhook-id"])).size).toBe(1)
    expect(new Set(sent.map((item) => item.body)).size).toBe(1)
    // Each attempt is signed with its own timestamp.
    expect(
      new Set(sent.map((item) => item.headers["webhook-timestamp"])).size
    ).toBe(3)
  })

  it("gives up after the retry window and on permanent refusals", async () => {
    await management.create(admin, input({ eventTypes: ["ticket.created"] }))
    ticket()
    const run = dispatcher()
    answer = async () => ({ kind: "network" })
    for (let index = 0; index < 20; index++) {
      await run.runOnce()
      clock = new Date(clock.getTime() + 11 * 3_600_000)
    }
    const [failed] = deliveries()
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBeLessThanOrEqual(RETRY_DELAYS_MS.length + 2)
    expect(failed.last_result).toContain("Gave up")

    ticket()
    answer = async () => ({ kind: "response", status: 410 })
    await run.runOnce()
    expect(deliveries().find((item) => item.id !== failed.id)).toMatchObject({
      status: "failed",
      attempts: 1,
    })
    answer = async () => ({ kind: "not-public" })
    ticket()
    await run.runOnce()
    expect(
      deliveries().filter((item) => item.status === "failed")
    ).toHaveLength(3)
  })

  it("recovers leased work after a restart", async () => {
    await management.create(admin, input({ eventTypes: ["ticket.created"] }))
    ticket()
    // A sender that claimed the delivery and then stopped mid-request.
    webhooks.claimDue(clock, 4, 60_000)
    await dispatcher().runOnce()
    expect(sent).toHaveLength(0)
    clock = new Date(clock.getTime() + 61_000)
    await dispatcher().runOnce()
    expect(sent).toHaveLength(1)
    expect(deliveries()[0].status).toBe("succeeded")
  })

  it("applies disabling, new destinations and narrower selections to queued work", async () => {
    const { id } = await management.create(
      admin,
      input({ eventTypes: ["ticket.created"] })
    )
    ticket(billing)
    await management.update(
      admin,
      id,
      input({ eventTypes: ["ticket.created"], enabled: false })
    )
    expect(deliveries()[0]).toMatchObject({
      status: "cancelled",
      last_result: "Cancelled: the subscription was disabled.",
    })
    // Enabling starts with new events.
    await management.update(
      admin,
      id,
      input({ eventTypes: ["ticket.created"] })
    )
    await dispatcher().runOnce()
    expect(sent).toHaveLength(0)

    ticket(billing)
    await management.update(
      admin,
      id,
      input({
        eventTypes: ["ticket.created"],
        url: "https://other.example.com/hook",
      })
    )
    expect(
      deliveries().filter((item) => item.status === "cancelled")
    ).toHaveLength(2)

    // Narrower selections cancel queued work when it would be sent.
    const other = "https://other.example.com/hook"
    ticket(billing)
    await management.update(
      admin,
      id,
      input({ url: other, eventTypes: ["ticket.accepted"] })
    )
    await dispatcher().runOnce()
    await management.update(
      admin,
      id,
      input({ url: other, eventTypes: ["ticket.created"] })
    )
    ticket(portal)
    await management.update(
      admin,
      id,
      input({
        url: other,
        eventTypes: ["ticket.created"],
        allApplications: false,
        applicationIds: [billing],
      })
    )
    await dispatcher().runOnce()
    expect(sent).toHaveLength(0)
    expect(deliveries().map((item) => item.status)).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
      "cancelled",
    ])
    expect(
      deliveries()
        .map((item) => item.last_result)
        .slice(2)
    ).toEqual([
      "Cancelled: the subscription no longer selects this event or Application.",
      "Cancelled: the subscription no longer selects this event or Application.",
    ])
  })

  it("retries a failed delivery by hand only while it stays eligible", async () => {
    const { id } = await management.create(
      admin,
      input({ eventTypes: ["ticket.created"] })
    )
    ticket()
    answer = async () => ({ kind: "response", status: 400 })
    await dispatcher().runOnce()
    const [failed] = deliveries()
    expect(failed.status).toBe("failed")
    const detail = await management.get(admin, id)
    expect(detail!.deliveries.items[0]).toMatchObject({
      id: failed.id,
      retryable: true,
      lastStatus: 400,
    })
    expect(detail!.failedDeliveries).toBe(1)
    expect(
      (await management.list(admin)).subscriptions[0].failedDeliveries
    ).toBe(1)

    answer = async () => ({ kind: "response", status: 202 })
    await management.retryDelivery(admin, id, failed.id)
    await expect(
      management.retryDelivery(admin, id, failed.id)
    ).rejects.toMatchObject({ status: 409 })
    await dispatcher().runOnce()
    expect(deliveries()[0]).toMatchObject({ status: "succeeded", attempts: 2 })
    expect(sent[0].headers["webhook-id"]).toBe(sent[1].headers["webhook-id"])
    expect(sent[0].body).toBe(sent[1].body)

    ticket()
    answer = async () => ({ kind: "response", status: 400 })
    await dispatcher().runOnce()
    const second = deliveries().find((item) => item.status === "failed")!
    await management.update(
      admin,
      id,
      input({
        eventTypes: ["ticket.created"],
        url: "https://new.example.com/hook",
      })
    )
    await expect(
      management.retryDelivery(admin, id, second.id)
    ).rejects.toThrow(WebhookError)
    expect(
      (await management.get(admin, id))!.deliveries.items.every(
        (item) => !item.retryable
      )
    ).toBe(true)
  })

  it("keeps Ticket decisions independent of receivers and records decision events", async () => {
    await management.create(admin, input())
    const github = createFakeGitHub()
    const decisions = createTicketDecisions({
      tickets,
      applications: createApplicationsRepository(db),
      audit: createAuditRepository(db),
      github: createGitHubIssues("token", github.fetcher),
      baseUrl: "http://localhost:3000",
      now: () => clock,
    })
    const accepted = ticket()
    const declined = ticket()
    // The receiver is down; decisions do not wait for it.
    answer = async () => ({ kind: "network" })
    await decisions.accept(
      accepted,
      {
        title: "Invoice fails",
        body: "Body",
        kind: "data-fix",
        repositoryId,
        targetIssueNumber: null,
      },
      { type: "admin", userId: adminId }
    )
    await decisions.decline(
      declined,
      "Works as intended, see jane@example.com",
      { type: "admin", userId: adminId }
    )
    expect(sent).toHaveLength(0)
    const types = deliveries()
      .map((item) => item.type)
      .sort()
    expect(types).toEqual([
      "github.issue.created",
      "ticket.accepted",
      "ticket.created",
      "ticket.created",
      "ticket.declined",
    ])
    await dispatcher().runOnce()
    const declinedEvent = sent
      .map((item) => JSON.parse(item.body))
      .find((event) => event.type === "ticket.declined")
    expect(declinedEvent.data.ticket.declineReason).toBe(
      "Works as intended, see [redacted email]"
    )
    const acceptedEvent = sent
      .map((item) => JSON.parse(item.body))
      .find((event) => event.type === "ticket.accepted")
    expect(acceptedEvent.data.ticket.filedIssue).toMatchObject({
      outcome: "new",
      number: 1,
    })
    expect(new Set(sent.map((item) => item.headers["webhook-id"])).size).toBe(5)
  })

  it("drops completed history after the retention period", async () => {
    await management.create(admin, input({ eventTypes: ["ticket.created"] }))
    ticket()
    await dispatcher().runOnce()
    webhooks.prune(new Date(clock.getTime() + 1))
    expect(deliveries()).toHaveLength(0)
    expect(
      db.$client.prepare("select count(*) as n from webhook_event").get()
    ).toEqual({ n: 0 })
  })
})

describe("HTTPS transport", () => {
  let certDir: string
  beforeEach(() => {
    certDir = mkdtempSync(join(tmpdir(), "agent6-cert-"))
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-keyout",
        join(certDir, "key.pem"),
        "-out",
        join(certDir, "cert.pem"),
        "-subj",
        "/CN=hooks.example.test",
        "-addext",
        "subjectAltName=DNS:hooks.example.test",
      ],
      { stdio: "ignore" }
    )
  })
  afterEach(() => rmSync(certDir, { recursive: true, force: true }))

  it("connects to the checked address, verifies the host name and does not follow redirects", async () => {
    const received: Array<{ headers: Record<string, unknown>; body: string }> =
      []
    const server = createServer(
      {
        key: readFileSync(join(certDir, "key.pem")),
        cert: readFileSync(join(certDir, "cert.pem")),
      },
      (request, response) => {
        let body = ""
        request.on("data", (chunk: Buffer) => (body += chunk.toString()))
        request.on("end", () => {
          received.push({ headers: request.headers, body })
          if (request.url === "/moved") {
            response
              .writeHead(302, { location: "https://169.254.169.254/" })
              .end()
          } else response.writeHead(200).end("x".repeat(200_000))
        })
      }
    )
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as { port: number }).port
    const ca = readFileSync(join(certDir, "cert.pem"))
    const loopback = async () => [{ address: "127.0.0.1", family: 4 }]
    try {
      const secret = newSigningSecret()
      const body = JSON.stringify({ id: "evt_1" })
      const headers = signedHeaders([secret], "evt_1", body, new Date())
      expect(
        await postWebhook(
          `https://hooks.example.test:${port}/hook`,
          body,
          headers,
          { resolve: loopback, tls: { ca } }
        )
      ).toEqual({ kind: "response", status: 200 })
      expect(received[0].body).toBe(body)
      expect(received[0].headers["webhook-id"]).toBe("evt_1")
      expect(received[0].headers["content-type"]).toBe("application/json")
      expect(
        await postWebhook(
          `https://hooks.example.test:${port}/moved`,
          body,
          headers,
          { resolve: loopback, tls: { ca } }
        )
      ).toEqual({ kind: "response", status: 302 })
      expect(received).toHaveLength(2)
      // The certificate does not name this host: refused.
      expect(
        (
          await postWebhook(
            `https://other.example.test:${port}/hook`,
            body,
            headers,
            { resolve: loopback, tls: { ca } }
          )
        ).kind
      ).toBe("tls")
      // Without an injected resolver, a loopback destination is never contacted.
      expect(
        await postWebhook(`https://127.0.0.1:${port}/hook`, body, headers)
      ).toEqual({ kind: "not-public" })
      expect(received).toHaveLength(2)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
