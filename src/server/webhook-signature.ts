import "@tanstack/react-start/server-only"

import { createHmac, randomBytes } from "node:crypto"

/*
 * Standard Webhooks signatures: HMAC-SHA256 over
 * `<webhook-id>.<webhook-timestamp>.<raw body>`, keyed with the bytes of a
 * `whsec_`-prefixed base64 secret, sent as `v1,<base64>`. During a rotation
 * with overlap the header carries one signature per secret.
 */

const PREFIX = "whsec_"

/** A new signing secret, unique to one Webhook Subscription. */
export function newSigningSecret(): string {
  return `${PREFIX}${randomBytes(32).toString("base64")}`
}

function keyOf(secret: string): Buffer {
  return Buffer.from(
    secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret,
    "base64"
  )
}

export function sign(
  secret: string,
  id: string,
  timestamp: number,
  body: string
): string {
  const signature = createHmac("sha256", keyOf(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64")
  return `v1,${signature}`
}

/** The three Standard Webhooks headers for one attempt. */
export function signedHeaders(
  secrets: Array<string>,
  id: string,
  body: string,
  at: Date
): Record<string, string> {
  const timestamp = Math.floor(at.getTime() / 1000)
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": secrets
      .map((secret) => sign(secret, id, timestamp, body))
      .join(" "),
  }
}
