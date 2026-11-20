import "@tanstack/react-start/server-only"

/**
 * In-memory token buckets, one per key. Each bucket holds up to `capacity`
 * tokens and refills continuously; a request takes one.
 */
export function createRateLimiter(options: {
  capacity: number
  perSecond: number
  now?: () => number
}) {
  const buckets = new Map<string, { tokens: number; at: number }>()
  const now = () => options.now?.() ?? Date.now()

  function bucket(key: string) {
    const at = now()
    const found = buckets.get(key)
    const tokens = found
      ? Math.min(
          options.capacity,
          found.tokens + ((at - found.at) / 1000) * options.perSecond
        )
      : options.capacity
    const next = { tokens, at }
    buckets.set(key, next)
    if (buckets.size > 10_000) {
      // Forget full buckets first; they are indistinguishable from new ones.
      for (const [name, item] of buckets)
        if (item.tokens >= options.capacity) buckets.delete(name)
    }
    return next
  }

  return {
    /** Takes a token. Answers how many seconds to wait when there is none. */
    take(key: string): { ok: true } | { ok: false; retryAfter: number } {
      const item = bucket(key)
      if (item.tokens >= 1) {
        item.tokens -= 1
        return { ok: true }
      }
      return {
        ok: false,
        retryAfter: Math.max(
          1,
          Math.ceil((1 - item.tokens) / options.perSecond)
        ),
      }
    },
  }
}
export type RateLimiter = ReturnType<typeof createRateLimiter>
