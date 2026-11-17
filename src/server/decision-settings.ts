import "@tanstack/react-start/server-only"

import { getConfig } from "./config"
import { requestDecisions } from "./decision-ai"
import { createSettingsRepository } from "./repositories/settings"
import { requireAdmin } from "./session"
import type { Auth } from "./auth"
import type { Config } from "./config"
import type { SettingsRepository } from "./repositories/settings"
import type {
  DecisionSettings,
  DecisionSettingsResult,
} from "@/lib/decision-ai"

export const decisionEnabled = (settings: Pick<SettingsRepository, "get">) =>
  settings.get("decisionAiEnabled") !== "false"

export function createDecisionSettingsManagement(
  deps: {
    auth?: Auth
    settings?: SettingsRepository
    config?: Config
    request?: typeof requestDecisions
  } = {}
) {
  const settings = deps.settings ?? createSettingsRepository()
  const config = () => deps.config ?? getConfig()
  function snapshot(): DecisionSettings {
    const decision = config().decisionAi
    return {
      status: decision?.status ?? "unconfigured",
      enabled: decision?.status === "configured" && decisionEnabled(settings),
      ...(decision?.status === "configured"
        ? { provider: decision.provider, model: decision.model }
        : {}),
      problems: decision?.status === "invalid" ? decision.problems : [],
    }
  }
  return {
    async get(headers: Headers) {
      await requireAdmin({ auth: deps.auth, headers })
      return snapshot()
    },
    async save(
      headers: Headers,
      enabled: boolean
    ): Promise<DecisionSettingsResult> {
      await requireAdmin({ auth: deps.auth, headers })
      if (config().decisionAi?.status !== "configured")
        return {
          ok: false,
          message:
            "Configure Decision AI in the server environment before changing this setting.",
        }
      settings.set("decisionAiEnabled", String(enabled))
      return {
        ok: true,
        message:
          "Decision AI setting saved. Changes apply to the next reply in every Conversation.",
      }
    },
    async test(headers: Headers): Promise<DecisionSettingsResult> {
      await requireAdmin({ auth: deps.auth, headers })
      const decision = config().decisionAi
      if (decision?.status !== "configured")
        return {
          ok: false,
          message:
            "Decision AI is not configured correctly. Check the server environment.",
        }
      const signal = AbortSignal.timeout(3000)
      let abort: () => void = () => {}
      try {
        const answers = await Promise.race([
          (deps.request ?? requestDecisions)(
            decision,
            "Synthetic connection test: a support request asks where to find an invoice.",
            [
              {
                name: "support",
                type: "predicate",
                instructions: "Is this a request for Application support?",
              },
            ],
            signal
          ),
          new Promise<never>((_, reject) => {
            abort = () => reject(new Error("timeout"))
            signal.addEventListener("abort", abort, { once: true })
          }),
        ])
        if (answers.support.type !== "predicate")
          throw new Error("invalid test result")
        return {
          ok: true,
          message:
            "Connection successful. The provider returned a valid decision. Your enabled setting has not changed.",
        }
      } catch {
        return {
          ok: false,
          message:
            "Connection test failed. Check the provider, model, endpoint and credentials in the server environment, then try again.",
        }
      } finally {
        signal.removeEventListener("abort", abort)
      }
    },
  }
}
