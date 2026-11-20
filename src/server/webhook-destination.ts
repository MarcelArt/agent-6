import "@tanstack/react-start/server-only"

import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { BlockList, isIP } from "node:net"
import type { LookupFunction } from "node:net"
import type { RequestOptions } from "node:https"
import { MAX_WEBHOOK_URL, WEBHOOK_TIMEOUT_SECONDS } from "@/lib/webhooks"

/*
 * Where webhooks may go: public HTTPS addresses only. The address is checked
 * when an Admin saves it and again for every request, which connects only to
 * the address that passed the check while TLS still verifies the host name.
 */

// Separate lists: a BlockList also matches IPv4 against IPv4-mapped IPv6 rules.
const blockedV4 = new BlockList()
const blockedV6 = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blockedV4.addSubnet(network, prefix, "ipv4")
for (const [network, prefix] of [
  // IPv4-compatible, loopback, unspecified; IPv4-mapped and NAT64 ranges.
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blockedV6.addSubnet(network, prefix, "ipv6")
const globalUnicast = new BlockList()
globalUnicast.addSubnet("2000::", 3, "ipv6")

/** Whether an IP address is reachable on the public internet. */
export function isPublicAddress(address: string): boolean {
  const bare = address
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase()
  switch (isIP(bare)) {
    case 4:
      return !blockedV4.check(bare, "ipv4")
    case 6:
      return globalUnicast.check(bare, "ipv6") && !blockedV6.check(bare, "ipv6")
    default:
      return false
  }
}

export class DestinationError extends Error {
  constructor(
    message: string,
    public readonly reason: "invalid" | "not-public" | "unresolvable"
  ) {
    super(message)
  }
}

const NOT_PUBLIC =
  "This address leads to a private, loopback, link-local or otherwise non-public network. Use a public HTTPS address."

/** The address in the form it is stored, or a `DestinationError`. */
export function validWebhookUrl(text: string): string {
  let url: URL | undefined
  try {
    url = new URL(text.trim())
  } catch {
    // Reported below.
  }
  if (!url || url.protocol !== "https:")
    throw new DestinationError(
      "Enter an https:// address, for example https://hooks.example.com/agent6.",
      "invalid"
    )
  if (url.username || url.password)
    throw new DestinationError(
      "Remove the user name and password from the address. Receivers verify the signature instead.",
      "invalid"
    )
  if (url.hash)
    throw new DestinationError(
      "Remove the # fragment from the address.",
      "invalid"
    )
  if (url.href.length > MAX_WEBHOOK_URL)
    throw new DestinationError(
      `Use an address of up to ${MAX_WEBHOOK_URL} characters.`,
      "invalid"
    )
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) {
    if (!isPublicAddress(host))
      throw new DestinationError(NOT_PUBLIC, "not-public")
  } else if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    !host.includes(".")
  )
    throw new DestinationError(NOT_PUBLIC, "not-public")
  return url.href
}

export type ResolvedAddress = { address: string; family: number }
export type Resolver = (host: string) => Promise<Array<ResolvedAddress>>

/**
 * The addresses of `host`, which must all be public. A name that also
 * leads somewhere private is refused rather than filtered.
 */
export const resolvePublic: Resolver = async (host) => {
  const family = isIP(host)
  if (family) {
    if (!isPublicAddress(host))
      throw new DestinationError(NOT_PUBLIC, "not-public")
    return [{ address: host, family }]
  }
  let addresses: Array<ResolvedAddress>
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    addresses = []
  }
  if (!addresses.length)
    throw new DestinationError(
      `${host} could not be found. Check the address.`,
      "unresolvable"
    )
  if (addresses.some((item) => !isPublicAddress(item.address)))
    throw new DestinationError(NOT_PUBLIC, "not-public")
  return addresses
}

/** What one request ended with. Response content is never kept. */
export type PostResult =
  | { kind: "response"; status: number }
  | { kind: "timeout" | "network" | "tls" | "unresolvable" | "not-public" }

const MAX_RESPONSE_BYTES = 64 * 1024

/**
 * POSTs `body` to a public HTTPS address without following redirects, with
 * a short timeout, reading at most a little of the answer.
 */
export async function postWebhook(
  target: string,
  body: string,
  headers: Record<string, string>,
  options: {
    resolve?: Resolver
    timeoutMs?: number
    /** Extra TLS options, for tests with their own certificate authority. */
    tls?: Pick<RequestOptions, "ca">
  } = {}
): Promise<PostResult> {
  const url = new URL(target)
  const host = url.hostname.replace(/^\[|\]$/g, "")
  let address: ResolvedAddress
  try {
    ;[address] = await (options.resolve ?? resolvePublic)(host)
  } catch (error) {
    return {
      kind:
        error instanceof DestinationError && error.reason === "not-public"
          ? "not-public"
          : "unresolvable",
    }
  }
  // Connect to the checked address only; never resolve the name again.
  const pinned: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all)
      callback(null, [{ address: address.address, family: address.family }])
    else callback(null, address.address, address.family)
  }
  const timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_SECONDS * 1000
  return new Promise<PostResult>((resolve) => {
    let settled = false
    const finish = (result: PostResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const outgoing = request(
      {
        protocol: "https:",
        hostname: isIP(host) ? address.address : host,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        agent: false,
        lookup: pinned,
        servername: isIP(host) ? undefined : host,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "user-agent": "Agent6-Webhooks/1",
          ...headers,
        },
        ...options.tls,
      },
      (response) => {
        const status = response.statusCode ?? 0
        let received = 0
        response.on("data", (chunk: Buffer) => {
          received += chunk.length
          if (received > MAX_RESPONSE_BYTES) {
            response.destroy()
            finish({ kind: "response", status })
          }
        })
        response.on("end", () => finish({ kind: "response", status }))
        response.on("close", () => finish({ kind: "response", status }))
        response.on("error", () => finish({ kind: "response", status }))
      }
    )
    const timer = setTimeout(() => {
      finish({ kind: "timeout" })
      outgoing.destroy()
    }, timeoutMs)
    outgoing.on("error", (error: NodeJS.ErrnoException) => {
      const code = error.code ?? ""
      finish({
        kind:
          /CERT|SSL|TLS|SELF_SIGNED|ALTNAME|ERR_TLS/i.test(code) ||
          /certificate|altname/i.test(error.message)
            ? "tls"
            : "network",
      })
    })
    outgoing.end(body)
  })
}

/** Whether a result is worth another automatic attempt, and how to describe it. */
export function describeResult(result: PostResult): {
  outcome: "succeeded" | "retry" | "failed"
  status: number | null
  text: string
} {
  if (result.kind === "response") {
    const { status } = result
    if (status >= 200 && status < 300)
      return { outcome: "succeeded", status, text: `HTTP ${status}` }
    if (status === 408 || status === 429 || status >= 500)
      return {
        outcome: "retry",
        status,
        text: `HTTP ${status} from the receiver`,
      }
    if (status >= 300 && status < 400)
      return {
        outcome: "failed",
        status,
        text: `HTTP ${status}: redirects are not followed. Use the final address.`,
      }
    return {
      outcome: "failed",
      status,
      text: `HTTP ${status}: the receiver refused the request.`,
    }
  }
  switch (result.kind) {
    case "timeout":
      return {
        outcome: "retry",
        status: null,
        text: `No answer within ${WEBHOOK_TIMEOUT_SECONDS} seconds.`,
      }
    case "tls":
      return {
        outcome: "retry",
        status: null,
        text: "The receiver's TLS certificate was not accepted.",
      }
    case "unresolvable":
      return {
        outcome: "retry",
        status: null,
        text: "The destination's host name could not be found.",
      }
    case "not-public":
      return {
        outcome: "failed",
        status: null,
        text: "The destination now leads to a non-public address, so nothing was sent.",
      }
    default:
      return {
        outcome: "retry",
        status: null,
        text: "The connection to the receiver failed.",
      }
  }
}
