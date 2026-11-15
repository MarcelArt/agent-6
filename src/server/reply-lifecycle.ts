import "@tanstack/react-start/server-only"

/** Replies keep running after a browser disconnects, so HTTP draining alone is insufficient. */
export function createReplyLifecycle() {
  let stopping = false
  const active = new Set<Promise<void>>()
  return {
    get stopping() {
      return stopping
    },
    begin() {
      if (stopping) throw new Error("Agent 6 is shutting down.")
      let finish!: () => void
      const done = new Promise<void>((resolve) => {
        finish = resolve
      })
      active.add(done)
      return () => {
        active.delete(done)
        finish()
      }
    },
    async drain() {
      stopping = true
      await Promise.all(active)
    },
  }
}

export const replies = createReplyLifecycle()
