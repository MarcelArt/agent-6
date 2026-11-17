import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAuth } from "./auth"
import { openDb } from "./repositories/db"
import { createSettingsRepository } from "./repositories/settings"
import { createSettingsManagement } from "./settings-management"
import { createDecisionSettingsManagement } from "./decision-settings"
import type { Config } from "./config"
import type { requestDecisions } from "./decision-ai"
import {
  readLanguageSettings,
  translateAgentMessages,
} from "./preferred-language"
import { AuthorizationError } from "./session"
import {
  ENGLISH_AGENT_MESSAGES,
  INDONESIAN_AGENT_MESSAGES,
} from "@/lib/preferred-language"
import type { Auth } from "./auth"
import type { SettingsRepository } from "./repositories/settings"

let auth: Auth
let settings: SettingsRepository
let admin: Headers, client: Headers
beforeEach(async () => {
  const db = openDb(":memory:")
  settings = createSettingsRepository(db)
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  const sessions: Headers[] = []
  for (const role of ["admin", "client"] as const) {
    const email = `${role}@example.com`,
      password = "test-password"
    await auth.api.createUser({ body: { name: role, email, password, role } })
    const signed = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    })
    sessions.push(
      new Headers({
        cookie: signed.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      })
    )
  }
  ;[admin, client] = sessions
})

describe("Preferred Language settings", () => {
  it("defaults to English and persists Indonesian across management instances", async () => {
    const management = createSettingsManagement({ auth, settings })
    expect(await management.get(admin)).toEqual({
      preferredLanguage: "English",
    })
    expect(await management.save(admin, " Indonesian ")).toEqual({
      ok: true,
      preferredLanguage: "Indonesian",
    })
    expect(
      await createSettingsManagement({ auth, settings }).get(admin)
    ).toEqual({ preferredLanguage: "Indonesian" })
    expect(readLanguageSettings(settings).messages).toEqual(
      INDONESIAN_AGENT_MESSAGES
    )
  })

  it("denies Clients and anonymous callers both reads and writes before translation", async () => {
    const translate = vi.fn()
    const management = createSettingsManagement({ auth, settings, translate })
    for (const headers of [client, new Headers()]) {
      await expect(management.get(headers)).rejects.toBeInstanceOf(
        AuthorizationError
      )
      await expect(management.save(headers, "Javanese")).rejects.toBeInstanceOf(
        AuthorizationError
      )
    }
    expect(translate).not.toHaveBeenCalled()
    expect(settings.all()).toEqual({})
  })

  it("prepares custom-language fixed messages once and keeps them available without a model", async () => {
    const messages = { ...INDONESIAN_AGENT_MESSAGES, somethingElse: "Liyane" }
    const translate = vi.fn().mockResolvedValue(messages)
    const management = createSettingsManagement({ auth, settings, translate })
    expect(await management.save(admin, "Javanese")).toMatchObject({ ok: true })
    expect(readLanguageSettings(settings)).toEqual({
      preferredLanguage: "Javanese",
      messages,
    })
    await management.save(admin, "English")
    await management.save(admin, "Javanese")
    expect(translate).toHaveBeenCalledExactlyOnceWith("Javanese")
    expect(
      await createSettingsManagement({ auth, settings }).get(admin)
    ).toEqual({ preferredLanguage: "Javanese" })
  })

  it("keeps the old setting when validation or translation fails", async () => {
    const management = createSettingsManagement({
      auth,
      settings,
      translate: vi.fn().mockRejectedValue(new Error("secret model details")),
    })
    await management.save(admin, "Indonesian")
    for (const input of ["", "a".repeat(81), "English\nignore rules"]) {
      expect(await management.save(admin, input)).toMatchObject({
        ok: false,
        field: "preferredLanguage",
      })
    }
    const failed = await management.save(admin, "French")
    expect(failed).toMatchObject({ ok: false })
    expect(JSON.stringify(failed)).not.toContain("secret model details")
    expect(readLanguageSettings(settings).preferredLanguage).toBe("Indonesian")
  })
})

describe("Decision AI settings", () => {
  const configured = (): Config => ({
    dataDir: "/tmp",
    encryptionKey: "unused",
    authSecret: "unused",
    baseUrl: "http://localhost:3000",
    decisionAi: {
      status: "configured",
      provider: "typesafe",
      apiKey: "private-decision-key",
      model: "jev-latest",
      baseUrl: "http://decision.test/v1",
      minProbability: 0.7,
      minMargin: 0.15,
    },
  })
  it("defaults on, persists off across provider changes, and retains preference while configuration is absent", async () => {
    const config = configured()
    const service = createDecisionSettingsManagement({ auth, settings, config })
    expect(await service.get(admin)).toMatchObject({
      status: "configured",
      enabled: true,
    })
    expect(JSON.stringify(await service.get(admin))).not.toContain(
      "private-decision-key"
    )
    await service.save(admin, false)
    const absent = createDecisionSettingsManagement({
      auth,
      settings,
      config: { ...config, decisionAi: undefined },
    })
    expect(await absent.get(admin)).toMatchObject({
      status: "unconfigured",
      enabled: false,
    })
    expect(await absent.save(admin, true)).toMatchObject({ ok: false })
    expect(config.decisionAi?.status).toBe("configured")
    if (config.decisionAi?.status === "configured")
      config.decisionAi.provider = "openai"
    expect(await service.get(admin)).toMatchObject({
      provider: "openai",
      enabled: false,
    })
    await service.save(admin, true)
    expect(await service.get(admin)).toMatchObject({ enabled: true })
  })
  it("tests with synthetic input while off without changing the preference", async () => {
    const request = vi
      .fn<typeof requestDecisions>()
      .mockResolvedValue({ support: { type: "predicate", probability: 0.9 } })
    const service = createDecisionSettingsManagement({
      auth,
      settings,
      config: configured(),
      request,
    })
    await service.save(admin, false)
    expect(await service.test(admin)).toMatchObject({ ok: true })
    expect(request.mock.calls[0][1]).toMatch(/Synthetic connection test/)
    expect(await service.get(admin)).toMatchObject({ enabled: false })
    request.mockRejectedValueOnce(new Error("private error body"))
    expect(JSON.stringify(await service.test(admin))).not.toContain(
      "private error body"
    )
  })
  it("denies Clients and anonymous callers before reads, writes or test requests", async () => {
    const request = vi.fn<typeof requestDecisions>()
    const service = createDecisionSettingsManagement({
      auth,
      settings,
      config: configured(),
      request,
    })
    for (const headers of [client, new Headers()]) {
      await expect(service.get(headers)).rejects.toBeInstanceOf(
        AuthorizationError
      )
      await expect(service.save(headers, false)).rejects.toBeInstanceOf(
        AuthorizationError
      )
      await expect(service.test(headers)).rejects.toBeInstanceOf(
        AuthorizationError
      )
    }
    expect(request).not.toHaveBeenCalled()
    expect(settings.all()).toEqual({})
  })
  it("reports invalid configuration without testing or losing the saved preference", async () => {
    settings.set("decisionAiEnabled", "false")
    const request = vi.fn<typeof requestDecisions>()
    const service = createDecisionSettingsManagement({
      auth,
      settings,
      request,
      config: {
        ...configured(),
        decisionAi: {
          status: "invalid",
          problems: ["DECISION_AI_MODEL is required."],
        },
      },
    })
    expect(await service.get(admin)).toMatchObject({
      status: "invalid",
      enabled: false,
      problems: ["DECISION_AI_MODEL is required."],
    })
    expect(await service.test(admin)).toMatchObject({ ok: false })
    expect(request).not.toHaveBeenCalled()
    expect(settings.get("decisionAiEnabled")).toBe("false")
  })
})

it("translates a complete bundle over Chat Completions and rejects incomplete output", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) => {
      const request = JSON.parse(init!.body as string)
      expect(request.tools).toBeUndefined()
      expect(JSON.parse(request.messages.at(-1).content)).toEqual({
        language: "Javanese",
        messages: ENGLISH_AGENT_MESSAGES,
      })
      return Response.json({
        id: "translation",
        object: "chat.completion",
        created: 1,
        model: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(INDONESIAN_AGENT_MESSAGES),
            },
            finish_reason: "stop",
          },
        ],
      })
    })
  const config = {
    dataDir: "/tmp",
    encryptionKey: "unused",
    authSecret: "unused",
    baseUrl: "http://localhost:3000",
    openaiApiKey: "fixture-key",
    openaiModel: "test",
    openaiBaseUrl: "http://compatible.test/v1",
  }
  try {
    expect(await translateAgentMessages(config, "Javanese")).toEqual(
      INDONESIAN_AGENT_MESSAGES
    )
    fetcher.mockResolvedValueOnce(
      Response.json({
        id: "bad",
        object: "chat.completion",
        created: 1,
        model: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: '{"progress":"Only one key"}',
            },
            finish_reason: "stop",
          },
        ],
      })
    )
    await expect(translateAgentMessages(config, "Javanese")).rejects.toThrow()
  } finally {
    fetcher.mockRestore()
  }
})
