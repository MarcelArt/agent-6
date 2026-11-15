import "@tanstack/react-start/server-only"

import { checkDb } from "./repositories/db"

export function healthResponse(check: () => void = checkDb): Response {
  try {
    check()
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
