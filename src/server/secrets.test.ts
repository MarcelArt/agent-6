import { describe, expect, it } from "vitest"
import { decrypt, encrypt } from "./secrets"

const KEY = Buffer.alloc(32, 1).toString("base64")
const OTHER_KEY = Buffer.alloc(32, 2).toString("base64")

describe("encrypt / decrypt", () => {
  it("round-trips text, including non-ASCII and empty text", () => {
    for (const secret of ["p@ssw0rd", "kata sandi ✓ 密码", ""]) {
      expect(decrypt(encrypt(secret, KEY), KEY)).toBe(secret)
    }
  })

  it("does not contain the plaintext and differs on every call", () => {
    const a = encrypt("hunter2-hunter2", KEY)
    const b = encrypt("hunter2-hunter2", KEY)
    expect(a).not.toContain("hunter2")
    expect(a).not.toBe(b)
  })

  it("refuses a value encrypted with another key", () => {
    expect(() => decrypt(encrypt("secret", KEY), OTHER_KEY)).toThrow(
      /Cannot decrypt/
    )
  })

  it("refuses a value that was changed", () => {
    const encrypted = encrypt("secret", KEY)
    const payload = Buffer.from(encrypted.slice(3), "base64")
    payload[payload.length - 1] ^= 1
    expect(() => decrypt(`v1:${payload.toString("base64")}`, KEY)).toThrow(
      /Cannot decrypt/
    )
  })

  it("refuses a value that is not an Agent 6 secret", () => {
    expect(() => decrypt("plain text", KEY)).toThrow(/not an Agent 6 secret/)
  })
})
