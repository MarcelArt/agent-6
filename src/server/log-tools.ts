import "@tanstack/react-start/server-only"

import { decrypt } from "./secrets"
import { createLogConnectionsRepository } from "./repositories/log-connections"
import { LOG_CAPS, LogQueryError, listLogLabels, queryLogRange } from "./loki"
import type { LokiTarget } from "./loki"
import type { LogConnectionsRepository } from "./repositories/log-connections"
import {
  SelectorError,
  confineMatchers,
  formatSelector,
  parseSelector,
  validMatcher,
} from "@/lib/log-connections"
import type { LabelMatcher } from "@/lib/log-connections"

const UNAVAILABLE = "That Log Connection is not available in this Application."

export function authHeader(saved: {
  authType: string
  authUsername: string
  encryptedAuthSecret: string | null
}) {
  if (saved.authType === "none" || !saved.encryptedAuthSecret) return null
  const secret = decrypt(saved.encryptedAuthSecret)
  return saved.authType === "basic"
    ? `Basic ${Buffer.from(`${saved.authUsername}:${secret}`).toString("base64")}`
    : `Bearer ${secret}`
}

export type LogQueryInput = {
  logConnectionId: string
  matchers: Array<LabelMatcher>
  filter: { kind: "text" | "regex"; value: string } | null
  /** ISO 8601. Null means one hour before `end`. */
  start: string | null
  /** ISO 8601. Null means now. */
  end: string | null
  limit: number | null
}

/** Check the live Attachment on every invocation, including after a detach. */
export function createLogTools(
  applicationId: string,
  signal?: AbortSignal,
  connections?: LogConnectionsRepository
) {
  /** The only way to a Loki target: through the Attachment and its Base Selector. */
  function confined(logConnectionId: string) {
    signal?.throwIfAborted()
    const available = connections ?? createLogConnectionsRepository()
    const baseSelector = available.baseSelector(applicationId, logConnectionId)
    const saved = available.credentials(logConnectionId)
    if (baseSelector === undefined || !saved)
      throw new LogQueryError(UNAVAILABLE)
    try {
      const target: LokiTarget = {
        baseUrl: saved.baseUrl,
        authHeader: authHeader(saved),
        tenantId: saved.tenantId,
      }
      return { target, base: parseSelector(baseSelector) }
    } catch {
      throw new LogQueryError(
        "This Log Connection is unavailable. Ask an Admin to test it."
      )
    }
  }
  async function guarded<T>(read: () => Promise<T>) {
    try {
      return await read()
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof LogQueryError) throw error
      if (error instanceof SelectorError) throw new LogQueryError(error.message)
      throw new LogQueryError(
        "This Log Connection is unavailable. Ask an Admin to test it."
      )
    }
  }
  return {
    /** Label names, or the values of `label`, within the Base Selector. */
    labels: (input: { logConnectionId: string; label: string | null }) =>
      guarded(async () => {
        const { target, base } = confined(input.logConnectionId)
        if (input.label !== null)
          validMatcher({ label: input.label, operator: "=", value: "" })
        return {
          fixedLabels: base.map((item) => item.label),
          ...(await listLogLabels(
            target,
            formatSelector(base),
            input.label,
            signal
          )),
        }
      }),
    query: (input: LogQueryInput) =>
      guarded(async () => {
        const { target, base } = confined(input.logConnectionId)
        if (input.matchers.length > 10)
          throw new LogQueryError("Use at most 10 extra label matchers.")
        let query = formatSelector(confineMatchers(base, input.matchers))
        if (input.filter?.value) {
          if (input.filter.value.length > 500)
            throw new LogQueryError(
              "Shorten the line filter to 500 characters."
            )
          query += ` ${input.filter.kind === "regex" ? "|~" : "|="} ${JSON.stringify(input.filter.value)}`
        }
        const end = input.end ? new Date(input.end) : new Date()
        const start = input.start
          ? new Date(input.start)
          : new Date(end.getTime() - LOG_CAPS.defaultRangeMs)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
          throw new LogQueryError(
            "Give start and end as ISO 8601 times, for example 2026-01-31T14:00:00Z."
          )
        if (start >= end)
          throw new LogQueryError("The start time must be before the end time.")
        if (end.getTime() - start.getTime() > LOG_CAPS.maxRangeMs)
          throw new LogQueryError(
            `The time range can be at most ${LOG_CAPS.maxRangeMs / (60 * 60_000)} hours. Query a shorter range.`
          )
        const limit = Math.min(
          Math.max(1, Math.trunc(input.limit ?? LOG_CAPS.defaultLines)),
          LOG_CAPS.maxLines
        )
        return queryLogRange(target, { query, start, end, limit }, signal)
      }),
  }
}
