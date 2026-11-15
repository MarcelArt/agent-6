import { describe, expect, it } from "vitest"
import { safeRedirect } from "./login-redirect"

describe("safeRedirect", () => {
  it("keeps a path inside Agent 6, with search and hash", () => {
    expect(safeRedirect("/admin/repositories")).toBe("/admin/repositories")
    expect(safeRedirect("/admin/users?page=2#top")).toBe(
      "/admin/users?page=2#top"
    )
  })

  it("falls back to /chat when there is no target", () => {
    expect(safeRedirect(undefined)).toBe("/chat")
    expect(safeRedirect("")).toBe("/chat")
  })

  it("refuses addresses that leave the site", () => {
    for (const target of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "chat",
    ]) {
      expect(safeRedirect(target)).toBe("/chat")
    }
  })

  it("does not loop back to the login page", () => {
    expect(safeRedirect("/login")).toBe("/chat")
    expect(safeRedirect("/login?redirect=/login")).toBe("/chat")
  })
})
