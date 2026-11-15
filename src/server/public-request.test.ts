import { describe, expect, it } from "vitest"
import { publicRequest } from "./public-request"

describe("public request origin", () => {
  it("replaces the internal port and scheme while preserving the body and browser origin", async () => {
    const incoming = new Request("http://127.0.0.1:3109/api/chat/one?x=1", {
      method: "POST",
      headers: { Origin: "https://support.example.com" },
      body: "message",
    })
    const forwarded = publicRequest(incoming, "https://support.example.com")
    expect(forwarded.url).toBe("https://support.example.com/api/chat/one?x=1")
    expect(forwarded.headers.get("Origin")).toBe("https://support.example.com")
    expect(await forwarded.text()).toBe("message")
  })

  it("preserves a foreign browser Origin and ignores spoofed forwarded headers", () => {
    const incoming = new Request("http://internal:3000//foreign.test/path", {
      headers: {
        Origin: "https://foreign.test",
        "X-Forwarded-Host": "foreign.test",
        "X-Forwarded-Proto": "http",
      },
    })
    const forwarded = publicRequest(
      incoming,
      "https://support.example.com:8443"
    )
    expect(new URL(forwarded.url).origin).toBe(
      "https://support.example.com:8443"
    )
    expect(forwarded.headers.get("Origin")).toBe("https://foreign.test")
  })
})
