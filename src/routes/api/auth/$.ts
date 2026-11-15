import { createFileRoute } from "@tanstack/react-router"
import { getAuth } from "@/server/auth"

/** Better Auth's own endpoints: sign-in, sign-out, session. */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
})
