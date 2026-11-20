import { createFileRoute } from "@tanstack/react-router"
import { getRequestIP } from "@tanstack/react-start/server"
import { handleApiRequest } from "@/server/api/handler"

/**
 * API v1 for Service Accounts. Authenticated with API Keys only; browser
 * sessions do not reach it. See src/server/api/ and /docs/api.
 */
const handle = ({ request }: { request: Request }) => {
  let address: string | undefined
  try {
    address = getRequestIP()
  } catch {
    address = undefined
  }
  return handleApiRequest(request, address)
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
})
