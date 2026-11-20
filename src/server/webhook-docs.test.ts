import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AUTH_FAILURE_RATE, KEY_RATE, MAX_BODY_BYTES } from "./api/handler"
import { pagingQuery } from "./api/schemas"
import { RETRY_DELAYS_MS } from "./webhook-dispatcher"
import { newSigningSecret, signedHeaders } from "./webhook-signature"
import { API_LIMITS } from "@/components/docs/api-content"
import {
  DOCUMENTED_RETRY_DELAYS_MS,
  OCCURRENCE_EXAMPLE,
  TEST_EVENT_EXAMPLE,
  VERIFY_WEBHOOK_CODE,
  WEBHOOK_EXAMPLES,
} from "@/lib/webhook-docs"
import {
  WEBHOOK_EVENT_TYPES,
  webhookEventSchema,
  webhookTestEventSchema,
} from "@/lib/webhooks"

/*
 * The public webhook reference must work as written: its verification code
 * runs here against Agent 6's own signatures, and its examples and numbers
 * are checked against the schema and the server.
 */

type Verify = (
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
  now?: number
) => unknown

let dir: string
let verifyWebhook: Verify

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent6-webhook-docs-"))
  const file = join(dir, "verify-webhook.mjs")
  writeFileSync(file, VERIFY_WEBHOOK_CODE)
  ;({ verifyWebhook } = (await import(
    /* @vite-ignore */ pathToFileURL(file).href
  )) as { verifyWebhook: Verify })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const body = JSON.stringify(WEBHOOK_EXAMPLES["ticket.accepted"])
const at = new Date("2026-11-20T10:03:42.000Z")

describe("the documented verification code", () => {
  it("accepts a request Agent 6 signed, and answers its event", () => {
    const secret = newSigningSecret()
    const headers = signedHeaders([secret], "evt_1", body, at)
    expect(verifyWebhook(body, headers, secret, at.getTime())).toEqual(
      JSON.parse(body)
    )
  })

  it("refuses a tampered body, another secret and a missing header", () => {
    const secret = newSigningSecret()
    const headers = signedHeaders([secret], "evt_1", body, at)
    expect(() =>
      verifyWebhook(
        body.replace("accepted", "declined"),
        headers,
        secret,
        at.getTime()
      )
    ).toThrow("Invalid signature")
    expect(() =>
      verifyWebhook(body, headers, newSigningSecret(), at.getTime())
    ).toThrow("Invalid signature")
    expect(() =>
      verifyWebhook(
        body,
        { ...headers, "webhook-id": "evt_2" },
        secret,
        at.getTime()
      )
    ).toThrow("Invalid signature")
    const { "webhook-signature": _signature, ...unsigned } = headers
    expect(() => verifyWebhook(body, unsigned, secret, at.getTime())).toThrow(
      "Missing webhook headers"
    )
  })

  it("refuses timestamps more than five minutes away", () => {
    const secret = newSigningSecret()
    const headers = signedHeaders([secret], "evt_1", body, at)
    expect(() =>
      verifyWebhook(body, headers, secret, at.getTime() + 4 * 60_000)
    ).not.toThrow()
    expect(() =>
      verifyWebhook(body, headers, secret, at.getTime() + 5 * 60_000 + 1_000)
    ).toThrow("Timestamp")
    expect(() =>
      verifyWebhook(body, headers, secret, at.getTime() - 6 * 60_000)
    ).toThrow("Timestamp")
  })

  it("accepts either secret while a rotation overlaps", () => {
    const [current, previous] = [newSigningSecret(), newSigningSecret()]
    const headers = signedHeaders([current, previous], "evt_1", body, at)
    expect(headers["webhook-signature"].split(" ")).toHaveLength(2)
    for (const secret of [current, previous])
      expect(() =>
        verifyWebhook(body, headers, secret, at.getTime())
      ).not.toThrow()
    expect(() =>
      verifyWebhook(body, headers, newSigningSecret(), at.getTime())
    ).toThrow("Invalid signature")
  })
})

describe("the documented examples and numbers", () => {
  it("are valid events of every type", () => {
    for (const type of WEBHOOK_EVENT_TYPES) {
      expect(webhookEventSchema.parse(WEBHOOK_EXAMPLES[type]).type).toBe(type)
    }
    expect(
      webhookEventSchema.parse(OCCURRENCE_EXAMPLE).data.ticket.filedIssue
    ).toMatchObject({ outcome: "comment" })
    expect(
      WEBHOOK_EXAMPLES["github.issue.created"].data.ticket.filedIssue
    ).toMatchObject({ outcome: "new" })
    expect(webhookTestEventSchema.parse(TEST_EVENT_EXAMPLE).type).toBe(
      "webhook.test"
    )
  })

  it("match the server's retry schedule and API limits", () => {
    expect(DOCUMENTED_RETRY_DELAYS_MS).toEqual(RETRY_DELAYS_MS)
    expect(API_LIMITS).toMatchObject({
      maxBodyBytes: MAX_BODY_BYTES,
      keyBurst: KEY_RATE.capacity,
      keyPerSecond: KEY_RATE.perSecond,
      authFailureBurst: AUTH_FAILURE_RATE.capacity,
      authFailurePerSecond: AUTH_FAILURE_RATE.perSecond,
    })
    expect(pagingQuery.parse({}).pageSize).toBe(API_LIMITS.defaultPageSize)
    expect(
      pagingQuery.safeParse({ pageSize: String(API_LIMITS.maxPageSize) })
        .success
    ).toBe(true)
    expect(
      pagingQuery.safeParse({ pageSize: String(API_LIMITS.maxPageSize + 1) })
        .success
    ).toBe(false)
  })
})
