export type DecisionSettings = {
  status: "configured" | "invalid" | "unconfigured"
  enabled: boolean
  provider?: string
  model?: string
  problems: string[]
}
export type DecisionSettingsResult = { ok: boolean; message: string }
