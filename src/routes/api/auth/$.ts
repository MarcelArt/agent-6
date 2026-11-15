import { createFileRoute } from "@tanstack/react-router"
import { handleAuthRequest } from "@/server/auth"

/** Better Auth's own endpoints: sign-in, sign-out, session. */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
})
