import "@tanstack/react-start/server-only"

import { createSettingsRepository } from "./repositories/settings"
import { requireAdmin } from "./session"
import { getConfig } from "./config"
import {
  builtInMessages,
  readLanguageSettings,
  translateAgentMessages,
} from "./preferred-language"
import type { Auth } from "./auth"
import type { SettingsRepository } from "./repositories/settings"
import type { LanguageResult } from "@/lib/preferred-language"
import { MAX_LANGUAGE_LENGTH } from "@/lib/preferred-language"

type SettingsDeps = {
  settings?: SettingsRepository
  translate?: (language: string) => ReturnType<typeof translateAgentMessages>
}

/** The Preferred Language, shared by Admin Settings and the API. Callers authorize first. */
export function createSettingsActions(deps: SettingsDeps = {}) {
  const settings = deps.settings ?? createSettingsRepository()
  return {
    get() {
      return {
        preferredLanguage: readLanguageSettings(settings).preferredLanguage,
      }
    },
    async save(input: string): Promise<LanguageResult> {
      const language = input.trim()
      if (
        !language ||
        language.length > MAX_LANGUAGE_LENGTH ||
        !/^[\p{L}\p{M}\p{N} ()'’.,-]+$/u.test(language)
      )
        return {
          ok: false,
          field: "preferredLanguage",
          message: `Enter a language name of up to ${MAX_LANGUAGE_LENGTH} characters, for example Indonesian.`,
        }
      if (
        !builtInMessages(language) &&
        !settings.get(`preferredLanguageMessages:${language}`)
      ) {
        try {
          const messages = await (
            deps.translate ??
            ((value) => translateAgentMessages(getConfig(), value))
          )(language)
          settings.set(
            `preferredLanguageMessages:${language}`,
            JSON.stringify(messages)
          )
        } catch {
          return {
            ok: false,
            message:
              "Agent 6 could not prepare its messages in this language. Check the model connection and try again. Your setting has not changed.",
          }
        }
      }
      settings.set("preferredLanguage", language)
      return { ok: true, preferredLanguage: language }
    },
  }
}

export function createSettingsManagement(
  deps: SettingsDeps & { auth?: Auth } = {}
) {
  const actions = createSettingsActions(deps)
  return {
    async get(headers: Headers) {
      await requireAdmin({ auth: deps.auth, headers })
      return actions.get()
    },
    async save(headers: Headers, input: string): Promise<LanguageResult> {
      await requireAdmin({ auth: deps.auth, headers })
      return actions.save(input)
    },
  }
}
