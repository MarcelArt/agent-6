/*
 * Numbers and codes the API reference states. The server's values live in
 * server-only modules; src/server/webhook-docs.test.ts checks these match.
 */

export const API_LIMITS = {
  /** Largest request body, in bytes. */
  maxBodyBytes: 64 * 1024,
  /** Requests per API Key: a burst, then a steady rate per second. */
  keyBurst: 120,
  keyPerSecond: 2,
  /** Failed authentications per client before answers become 429. */
  authFailureBurst: 20,
  authFailurePerSecond: 0.2,
  maxPageSize: 100,
  defaultPageSize: 20,
}

/** The `error.code` values each status can carry. */
export const ERROR_CODES: Array<{ status: number; codes: Array<string> }> = [
  { status: 400, codes: ["validation_failed", "invalid_json"] },
  { status: 401, codes: ["unauthorized"] },
  { status: 403, codes: ["forbidden"] },
  { status: 404, codes: ["not_found"] },
  { status: 405, codes: ["method_not_allowed"] },
  { status: 409, codes: ["conflict"] },
  { status: 413, codes: ["payload_too_large"] },
  { status: 415, codes: ["unsupported_media_type"] },
  { status: 429, codes: ["rate_limited"] },
  { status: 500, codes: ["internal_error"] },
  { status: 502, codes: ["upstream_failed"] },
  { status: 503, codes: ["unavailable"] },
]

/** A placeholder key in the documented shape. Never a real credential. */
export const EXAMPLE_API_KEY =
  "agent6_0123456789abcdef_EXAMPLE-ONLY-not-a-real-key-000000000000000"
