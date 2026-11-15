import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ConfigError, parseConfig } from "./config"

const KEY = Buffer.alloc(32, 7).toString("base64")

describe("parseConfig", () => {
  it("returns the validated configuration", () => {
    const config = parseConfig({ DATA_DIR: "./data", ENCRYPTION_KEY: KEY })
    expect(config).toEqual({
      dataDir: resolve("./data"),
      encryptionKey: KEY,
    })
  })

  it("names ENCRYPTION_KEY when it is missing", () => {
    expect(() => parseConfig({ DATA_DIR: "./data" })).toThrow(ConfigError)
    expect(() => parseConfig({ DATA_DIR: "./data" })).toThrow(/ENCRYPTION_KEY/)
  })

  it("names every missing variable at once", () => {
    try {
      parseConfig({})
      expect.unreachable()
    } catch (error) {
      expect((error as ConfigError).problems).toHaveLength(2)
      expect((error as Error).message).toMatch(/DATA_DIR/)
      expect((error as Error).message).toMatch(/ENCRYPTION_KEY/)
    }
  })

  it("rejects an empty DATA_DIR", () => {
    expect(() => parseConfig({ DATA_DIR: " ", ENCRYPTION_KEY: KEY })).toThrow(
      /DATA_DIR/
    )
  })

  it("rejects an ENCRYPTION_KEY that is not 32 bytes of base64", () => {
    expect(() =>
      parseConfig({ DATA_DIR: "./data", ENCRYPTION_KEY: "too-short" })
    ).toThrow(/ENCRYPTION_KEY must be 32 bytes/)
  })
})
