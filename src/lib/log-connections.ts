export const LOG_AUTH_TYPES = ["none", "basic", "bearer"] as const
export type LogAuthType = (typeof LOG_AUTH_TYPES)[number]
export type LogConnectionInput = {
  name: string
  /** A Loki server, or a Grafana datasource proxy URL that exposes the Loki API. */
  baseUrl: string
  authType: LogAuthType
  /** Basic auth only. */
  authUsername: string
  /**
   * The basic auth password or the bearer token. Empty on edit keeps the saved
   * one. Never returned to a reader.
   */
  authSecret: string
  /** Sent as X-Scope-OrgID. Empty for a single-tenant Loki. */
  tenantId: string
  tags: Array<string>
  description: string
}
export type LogConnectionTest = { ok: boolean; message: string }
export type LogConnection = Omit<LogConnectionInput, "authSecret"> & {
  id: string
  test: LogConnectionTest
}
export type LogConnectionField = keyof LogConnectionInput | "baseSelector"
export type LogConnectionProblem = {
  ok: false
  message: string
  field?: LogConnectionField
}
export type LogConnectionResult =
  { ok: true; connection: LogConnection } | LogConnectionProblem
export type LogStreamCountResult =
  { ok: true; streams: number } | LogConnectionProblem

/** How far back the Base Selector's live match count looks. */
export const STREAM_COUNT_HOURS = 24

/*
 * Log stream selectors. A Base Selector is parsed into matchers once, and
 * every query is rebuilt from matchers, so no LogQL text from the Admin or
 * the model reaches Loki unparsed.
 */

export const MATCH_OPERATORS = ["=", "!=", "=~", "!~"] as const
export type MatchOperator = (typeof MATCH_OPERATORS)[number]
export type LabelMatcher = {
  label: string
  operator: MatchOperator
  value: string
}
export class SelectorError extends Error {}

const LABEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  '"': '"',
  "\\": "\\",
}
const EXAMPLE = 'Write it like {app="billing"}.'

/** Parses a selector such as `{app="billing", env=~"prod|staging"}`. */
export function parseSelector(text: string): Array<LabelMatcher> {
  const source = text.trim()
  let at = 0
  const space = () => {
    while (/\s/.test(source[at] ?? "")) at++
  }
  const fail = (problem: string) => new SelectorError(`${problem} ${EXAMPLE}`)
  if (source[at++] !== "{")
    throw fail("A selector starts with { and ends with }.")
  const matchers: Array<LabelMatcher> = []
  for (;;) {
    space()
    if (source[at] === "}" && matchers.length) break
    const label = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(at))?.[0]
    if (!label) throw fail("A label name is missing.")
    at += label.length
    space()
    const operator = MATCH_OPERATORS.find(
      (item) =>
        source.startsWith(item, at) &&
        // "=" must not swallow the first character of "=~".
        (item.length === 2 || source[at + 1] !== "~")
    )
    if (!operator) throw fail(`Use =, !=, =~ or !~ after ${label}.`)
    at += operator.length
    space()
    const quote = source[at++]
    if (quote !== '"' && quote !== "`")
      throw fail(`Put the value of ${label} in double quotes.`)
    let value = ""
    for (;;) {
      const character = source[at++] as string | undefined
      if (character === undefined)
        throw fail(`The value of ${label} has no closing quote.`)
      if (character === quote) break
      if (character === "\\" && quote === '"') {
        const escaped = ESCAPES[source[at++] ?? ""] as string | undefined
        if (escaped === undefined)
          throw fail(
            `The value of ${label} has an unsupported backslash escape; double the backslash.`
          )
        value += escaped
      } else value += character
    }
    matchers.push(validMatcher({ label, operator, value }))
    space()
    if (source[at] === ",") at++
    else if (source[at] !== "}")
      throw fail("Separate label matchers with commas.")
  }
  if (at !== source.length - 1) throw fail("Remove the text after }.")
  if (new Set(matchers.map((item) => item.label)).size !== matchers.length)
    throw fail("Use each label once.")
  return matchers
}

export function validMatcher(matcher: LabelMatcher): LabelMatcher {
  if (!LABEL_NAME.test(matcher.label) || matcher.label.length > 200)
    throw new SelectorError(`"${matcher.label}" is not a label name.`)
  if (!MATCH_OPERATORS.includes(matcher.operator))
    throw new SelectorError("Use =, !=, =~ or !~ as the operator.")
  if (matcher.value.length > 500 || matcher.value.includes("\0"))
    throw new SelectorError(
      `The value of ${matcher.label} is too long or invalid.`
    )
  return matcher
}

/** JSON string escapes are also valid in a LogQL double-quoted string. */
export function formatSelector(matchers: Array<LabelMatcher>) {
  return `{${matchers.map((item) => `${item.label}${item.operator}${JSON.stringify(item.value)}`).join(", ")}}`
}

/**
 * The Base Selector's matchers followed by the extra ones. An extra matcher
 * on a Base Selector label is refused unless it repeats the Base Selector.
 */
export function confineMatchers(
  base: Array<LabelMatcher>,
  extra: Array<LabelMatcher>
): Array<LabelMatcher> {
  const result = [...base]
  for (const matcher of extra.map(validMatcher)) {
    const fixed = base.find((item) => item.label === matcher.label)
    if (!fixed) result.push(matcher)
    else if (
      fixed.operator !== matcher.operator ||
      fixed.value !== matcher.value
    )
      throw new SelectorError(
        `The label ${matcher.label} is fixed for this Application and cannot be changed. Leave it out.`
      )
  }
  return result
}
