import "@tanstack/react-start/server-only"

/** Replies keep running after a browser disconnects, so HTTP draining alone is insufficient. */
export function createReplyLifecycle() {
  let stopping = false
  const active = new Set<Promise<void>>()
  const cancellations = new Map<string, () => void>()
  return {
    cancel(id: string) {
      cancellations.get(id)?.()
    },
    get stopping() {
      return stopping
    },
    begin(id?: string, cancel?: () => void) {
      if (stopping) throw new Error("Agent 6 is shutting down.")
      let finish!: () => void
      const done = new Promise<void>((resolve) => {
        finish = resolve
      })
      active.add(done)
      if (id && cancel) cancellations.set(id, cancel)
      return () => {
        active.delete(done)
        if (id) cancellations.delete(id)
        finish()
      }
    },
    async drain() {
      stopping = true
      for (const cancel of cancellations.values()) cancel()
      await Promise.all(active)
    },
  }
}

export const replies = createReplyLifecycle()
