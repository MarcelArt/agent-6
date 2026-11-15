import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ConfigError, parseConfig } from "./config"

const KEY = Buffer.alloc(32, 7).toString("base64")
const AUTH = {
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
}

describe("parseConfig", () => {
  it("uses the support model for the Guardrail unless another model is set", () => {
    const env = {
      DATA_DIR: "./data",
      ENCRYPTION_KEY: KEY,
      ...AUTH,
      OPENAI_MODEL: "support",
    }
    expect(parseConfig(env).guardrailModel).toBe("support")
    expect(
      parseConfig({ ...env, GUARDRAIL_MODEL: "  cheap  " }).guardrailModel
    ).toBe("cheap")
    expect(parseConfig({ ...env, GUARDRAIL_MODEL: " " }).guardrailModel).toBe(
      "support"
    )
  })
  it("accepts a compatible model endpoint and names an invalid one", () => {
    const env = { DATA_DIR: "./data", ENCRYPTION_KEY: KEY, ...AUTH }
    expect(
      parseConfig({
        ...env,
        OPENAI_API_KEY: "key",
        OPENAI_MODEL: "local-model",
        OPENAI_BASE_URL: "http://localhost:8000/v1",
      })
    ).toMatchObject({
      openaiApiKey: "key",
      openaiModel: "local-model",
      openaiBaseUrl: "http://localhost:8000/v1",
    })
    expect(
      parseConfig({ ...env, OPENAI_BASE_URL: "" }).openaiBaseUrl
    ).toBeUndefined()
    expect(() =>
      parseConfig({ ...env, OPENAI_BASE_URL: "file:///tmp/model" })
    ).toThrow(/OPENAI_BASE_URL/)
  })
  it("returns the validated configuration", () => {
    const config = parseConfig({
      DATA_DIR: "./data",
      ENCRYPTION_KEY: KEY,
      ...AUTH,
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "password",
    })
    expect(config).toEqual({
      dataDir: resolve("./data"),
      encryptionKey: KEY,
      authSecret: AUTH.BETTER_AUTH_SECRET,
      baseUrl: AUTH.BETTER_AUTH_URL,
      adminEmail: "admin@example.com",
      adminPassword: "password",
    })
  })

  it("names ENCRYPTION_KEY when it is missing", () => {
    expect(() => parseConfig({ DATA_DIR: "./data", ...AUTH })).toThrow(
      ConfigError
    )
    expect(() => parseConfig({ DATA_DIR: "./data", ...AUTH })).toThrow(
      /ENCRYPTION_KEY/
    )
  })

  it("names every missing variable at once", () => {
    try {
      parseConfig({})
      expect.unreachable()
    } catch (error) {
      expect((error as ConfigError).problems).toHaveLength(4)
      expect((error as Error).message).toMatch(/DATA_DIR/)
      expect((error as Error).message).toMatch(/ENCRYPTION_KEY/)
      expect((error as Error).message).toMatch(/BETTER_AUTH_SECRET/)
      expect((error as Error).message).toMatch(/BETTER_AUTH_URL/)
    }
  })

  it("rejects an empty DATA_DIR", () => {
    expect(() =>
      parseConfig({ DATA_DIR: " ", ENCRYPTION_KEY: KEY, ...AUTH })
    ).toThrow(/DATA_DIR/)
  })

  it("rejects an ENCRYPTION_KEY that is not 32 bytes of base64", () => {
    expect(() =>
      parseConfig({ DATA_DIR: "./data", ENCRYPTION_KEY: "too-short", ...AUTH })
    ).toThrow(/ENCRYPTION_KEY must be 32 bytes/)
  })

  it("does not require the first Admin's credentials", () => {
    const config = parseConfig({
      DATA_DIR: "./data",
      ENCRYPTION_KEY: KEY,
      ...AUTH,
    })
    expect(config.adminEmail).toBeUndefined()
    expect(config.adminPassword).toBeUndefined()
  })

  it("rejects a short BETTER_AUTH_SECRET and a BETTER_AUTH_URL that is not a web address", () => {
    const env = { DATA_DIR: "./data", ENCRYPTION_KEY: KEY }
    expect(() =>
      parseConfig({ ...env, ...AUTH, BETTER_AUTH_SECRET: "short" })
    ).toThrow(/BETTER_AUTH_SECRET must be at least 32/)
    expect(() =>
      parseConfig({ ...env, ...AUTH, BETTER_AUTH_URL: "localhost" })
    ).toThrow(/BETTER_AUTH_URL must be an http or https address/)
  })
})
