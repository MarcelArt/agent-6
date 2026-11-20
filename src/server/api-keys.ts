import "@tanstack/react-start/server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/*
 * API Key material. A key is `agent6_<lookup id>_<secret>`: the lookup id
 * finds the stored record and is safe to show; the 256-bit secret is checked
 * against its SHA-256 digest. A slow hash adds nothing for random secrets
 * this long. The full key exists only in the answer that creates it.
 */

const PREFIX = "agent6_"
const KEY_PATTERN = /^agent6_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/

export function digestSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

/** A new key, and what to store for it. */
export function generateApiKey() {
  const lookupId = randomBytes(8).toString("hex")
  const secret = randomBytes(32).toString("base64url")
  return {
    key: `${PREFIX}${lookupId}_${secret}`,
    lookupId,
    digest: digestSecret(secret),
  }
}

/** The parts of a well-formed key, or null. */
export function parseApiKey(
  text: string
): { lookupId: string; secret: string } | null {
  const match = KEY_PATTERN.exec(text)
  return match ? { lookupId: match[1], secret: match[2] } : null
}

/** Compares in constant time. */
export function secretMatches(secret: string, digest: string): boolean {
  const actual = Buffer.from(digestSecret(secret), "hex")
  const expected = Buffer.from(digest, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function keyPrefix(lookupId: string): string {
  return `${PREFIX}${lookupId}`
}
