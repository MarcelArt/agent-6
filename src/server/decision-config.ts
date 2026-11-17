import "@tanstack/react-start/server-only"

export type DecisionProvider = "typesafe" | "cloudflare" | "openai"
export type DecisionConfig =
  | {
      status: "configured"
      provider: DecisionProvider
      apiKey: string
      model: string
      baseUrl: string
      minProbability: number
      minMargin: number
    }
  | { status: "invalid"; problems: string[] }

/** Optional configuration errors disable this feature, never application startup. */
export function parseDecisionConfig(
  env: Record<string, string | undefined>
): DecisionConfig | undefined {
  const value = (key: string) => env[`DECISION_AI_${key}`]?.trim() || ""
  if (
    !Object.entries(env).some(
      ([key, item]) => key.startsWith("DECISION_AI_") && item?.trim()
    )
  )
    return
  const problems: string[] = []
  const provider = value("PROVIDER")
  if (!["typesafe", "cloudflare", "openai"].includes(provider))
    problems.push(
      "DECISION_AI_PROVIDER must be typesafe, cloudflare or openai."
    )
  if (!value("API_KEY")) problems.push("DECISION_AI_API_KEY is required.")
  if (!value("MODEL")) problems.push("DECISION_AI_MODEL is required.")
  const account = value("ACCOUNT_ID")
  if (provider === "cloudflare" && !/^[a-zA-Z0-9_-]+$/.test(account))
    problems.push(
      "DECISION_AI_ACCOUNT_ID is required for Cloudflare and must be an account identifier."
    )
  if (
    provider === "cloudflare" &&
    !["@cf/cloudflare/clef", "@cf/cloudflare/clef-flash"].includes(
      value("MODEL")
    )
  )
    problems.push(
      "DECISION_AI_MODEL must be @cf/cloudflare/clef or @cf/cloudflare/clef-flash for Cloudflare."
    )
  let baseUrl =
    value("BASE_URL") ||
    (provider === "cloudflare"
      ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run`
      : provider === "typesafe"
        ? "https://api.typesafe.ai/v1"
        : "https://api.openai.com/v1")
  try {
    const url = new URL(baseUrl)
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error()
    baseUrl = url.toString().replace(/\/+$/, "")
  } catch {
    problems.push(
      "DECISION_AI_BASE_URL must be an http or https URL without credentials, query or fragment."
    )
  }
  const threshold = (key: string, fallback: number, minimum: number) => {
    const raw = value(key)
    const parsed = raw ? Number(raw) : fallback
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > 1)
      problems.push(`DECISION_AI_${key} must be between ${minimum} and 1.`)
    return parsed
  }
  const minProbability = threshold("MIN_PROBABILITY", 0.7, 0.5)
  const minMargin = threshold("MIN_MARGIN", 0.15, 0)
  if (problems.length) return { status: "invalid", problems }
  return {
    status: "configured",
    provider: provider as DecisionProvider,
    apiKey: value("API_KEY"),
    model: value("MODEL"),
    baseUrl,
    minProbability,
    minMargin,
  }
}
