import "@tanstack/react-start/server-only"

import { STREAM_COUNT_HOURS } from "@/lib/log-connections"
import type { LogConnectionTest } from "@/lib/log-connections"

export const LOG_CAPS = {
  defaultRangeMs: 60 * 60_000,
  maxRangeMs: 24 * 60 * 60_000,
  defaultLines: 100,
  maxLines: 200,
  lineChars: 2000,
  resultBytes: 48_000,
  labelValues: 200,
  timeoutMs: 10_000,
  responseBytes: 4_000_000,
}
export type LokiTarget = {
  baseUrl: string
  /** The whole Authorization header value, or null. Never put it in an error. */
  authHeader: string | null
  tenantId: string
}
/** Its message is safe to show to an Admin and to the model. */
export class LogQueryError extends Error {}

const nanos = (time: Date) => `${time.getTime()}000000`

async function request(
  target: LokiTarget,
  path: string,
  params: URLSearchParams,
  signal?: AbortSignal,
  timeoutMs = LOG_CAPS.timeoutMs
): Promise<unknown> {
  signal?.throwIfAborted()
  const timeout = AbortSignal.timeout(timeoutMs)
  const headers: Record<string, string> = { Accept: "application/json" }
  if (target.authHeader) headers.Authorization = target.authHeader
  if (target.tenantId) headers["X-Scope-OrgID"] = target.tenantId
  const hide = (text: string) =>
    target.authHeader ? text.replaceAll(target.authHeader, "[hidden]") : text
  try {
    const response = await fetch(
      `${target.baseUrl}/loki/api/v1/${path}?${params}`,
      {
        headers,
        // A redirect usually means a login page; never forward the header.
        redirect: "manual",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }
    )
    const body = await readCapped(response)
    if (response.status >= 300 && response.status < 400)
      throw new LogQueryError(
        "The log server redirected the request. Check the base URL and the auth header."
      )
    if (response.status === 401 || response.status === 403)
      throw new LogQueryError(
        "The log server refused the credentials. Check the auth header and tenant ID."
      )
    if (response.status === 404)
      throw new LogQueryError(
        "The Loki API was not found at this base URL. Check the base URL."
      )
    if (response.status === 400)
      throw new LogQueryError(
        hide(
          `The log server rejected the query: ${body.slice(0, 300).trim() || "no reason given"}`
        )
      )
    if (!response.ok)
      throw new LogQueryError(
        `The log server answered with status ${response.status}.`
      )
    try {
      return (JSON.parse(body) as { data?: unknown }).data
    } catch {
      throw new LogQueryError(
        "The server did not answer like Loki. Check the base URL."
      )
    }
  } catch (error) {
    if (error instanceof LogQueryError) throw error
    signal?.throwIfAborted()
    throw new LogQueryError(
      timeout.aborted
        ? "The log server did not answer in time. Try a shorter time range or more matchers."
        : "The log server could not be reached. Check the base URL."
    )
  }
}

async function readCapped(response: Response) {
  if (!response.body) return ""
  const chunks: Array<Uint8Array> = []
  let size = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength
    if (size > LOG_CAPS.responseBytes) {
      throw new LogQueryError(
        "The log server returned too much data. Use a shorter time range, more matchers or a lower limit."
      )
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function strings(data: unknown): Array<string> {
  return Array.isArray(data)
    ? data.filter((item): item is string => typeof item === "string")
    : []
}
function lastHours(hours: number) {
  const end = new Date()
  return new URLSearchParams({
    start: nanos(new Date(end.getTime() - hours * 60 * 60_000)),
    end: nanos(end),
  })
}

export async function testLoki(target: LokiTarget): Promise<LogConnectionTest> {
  try {
    await request(target, "labels", new URLSearchParams())
    return { ok: true, message: "Connection successful." }
  } catch (error) {
    if (error instanceof LogQueryError)
      return { ok: false, message: error.message }
    throw error
  }
}

/** How many streams `selector` matched in the last STREAM_COUNT_HOURS. */
export async function countLogStreams(target: LokiTarget, selector: string) {
  const params = lastHours(STREAM_COUNT_HOURS)
  params.set("match[]", selector)
  const data = await request(target, "series", params)
  return Array.isArray(data) ? data.length : 0
}

/** Label names, or one label's values, of the streams `selector` matches. */
export async function listLogLabels(
  target: LokiTarget,
  selector: string,
  label: string | null,
  signal?: AbortSignal
) {
  const params = lastHours(LOG_CAPS.maxRangeMs / (60 * 60_000))
  params.set("query", selector)
  const all = strings(
    await request(
      target,
      label ? `label/${encodeURIComponent(label)}/values` : "labels",
      params,
      signal
    )
  )
  return {
    values: all.slice(0, LOG_CAPS.labelValues),
    truncated: all.length > LOG_CAPS.labelValues,
  }
}

export async function queryLogRange(
  target: LokiTarget,
  options: { query: string; start: Date; end: Date; limit: number },
  signal?: AbortSignal
) {
  const data = (await request(
    target,
    "query_range",
    new URLSearchParams({
      query: options.query,
      start: nanos(options.start),
      end: nanos(options.end),
      limit: String(options.limit),
      direction: "backward",
    }),
    signal
  )) as {
    result?: Array<{
      stream?: Record<string, string>
      values?: Array<[string, string]>
    }>
  } | null
  const streams: Array<Record<string, string>> = []
  const all: Array<{ at: bigint; stream: number; line: string }> = []
  for (const item of Array.isArray(data?.result) ? data.result : []) {
    if (!Array.isArray(item.values)) continue
    streams.push(item.stream ?? {})
    for (const [at, line] of item.values)
      all.push({ at: BigInt(at), stream: streams.length - 1, line: `${line}` })
  }
  all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const reasons: Array<string> = []
  if (all.length >= options.limit)
    reasons.push(
      `The limit of ${options.limit} lines was reached; older matching lines may exist. Narrow the time range or add a filter.`
    )
  const lines: Array<{ time: string; stream: number; line: string }> = []
  let bytes = 0,
    cutLines = false
  for (const item of all.slice(0, options.limit)) {
    const cut = item.line.length > LOG_CAPS.lineChars
    const line = cut
      ? `${item.line.slice(0, LOG_CAPS.lineChars)}… [line cut]`
      : item.line
    bytes += Buffer.byteLength(line)
    if (bytes > LOG_CAPS.resultBytes) {
      reasons.push(
        "The output size cap was reached; the oldest lines were dropped."
      )
      break
    }
    cutLines ||= cut
    lines.push({
      time: new Date(Number(item.at / 1_000_000n)).toISOString(),
      stream: item.stream,
      line,
    })
  }
  if (cutLines)
    reasons.push(`Lines longer than ${LOG_CAPS.lineChars} characters were cut.`)
  return {
    start: options.start.toISOString(),
    end: options.end.toISOString(),
    /** Labels of each stream; a line's `stream` is an index into this list. */
    streams,
    /** Newest first. */
    lines,
    truncated: reasons.length > 0,
    truncation: reasons,
  }
}
