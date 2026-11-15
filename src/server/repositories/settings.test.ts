import { beforeEach, describe, expect, it } from "vitest"
import { openDb } from "./db"
import { createSettingsRepository } from "./settings"
import type { SettingsRepository } from "./settings"

describe("settings repository", () => {
  let settings: SettingsRepository

  beforeEach(() => {
    // A fresh in-memory database, created by the real migrations.
    settings = createSettingsRepository(openDb(":memory:"))
  })

  it("returns undefined for a key that was never set", () => {
    expect(settings.get("preferredLanguage")).toBeUndefined()
  })

  it("stores and reads a value", () => {
    settings.set("preferredLanguage", "Indonesian")
    expect(settings.get("preferredLanguage")).toBe("Indonesian")
  })

  it("replaces the value when the key is set again", () => {
    settings.set("preferredLanguage", "Indonesian")
    settings.set("preferredLanguage", "English")
    expect(settings.get("preferredLanguage")).toBe("English")
    expect(settings.all()).toEqual({ preferredLanguage: "English" })
  })

  it("deletes a key", () => {
    settings.set("a", "1")
    settings.set("b", "2")
    settings.delete("a")
    expect(settings.all()).toEqual({ b: "2" })
  })
})
