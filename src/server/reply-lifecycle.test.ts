import { describe, expect, it } from "vitest"
import { createReplyLifecycle } from "./reply-lifecycle"

describe("reply shutdown", () => {
  it("waits for every reply, including one whose browser disconnected", async () => {
    const lifecycle = createReplyLifecycle()
    const first = lifecycle.begin()
    const disconnected = lifecycle.begin()
    let drained = false
    const done = lifecycle.drain().then(() => {
      drained = true
    })
    expect(() => lifecycle.begin()).toThrow(/shutting down/)
    first()
    await Promise.resolve()
    expect(drained).toBe(false)
    disconnected()
    await done
    expect(drained).toBe(true)
  })
})
