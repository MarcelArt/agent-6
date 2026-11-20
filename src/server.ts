import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { startServer } from "./server/startup"
import { replies } from "./server/reply-lifecycle"
import { getRepositorySync } from "./server/repository-sync"
import { getWebhookDispatcher } from "./server/webhook-dispatcher"
import { closeDb } from "./server/repositories/db"
import { getConfig } from "./server/config"
import { publicRequest } from "./server/public-request"

// Validate configuration, migrate the database and create the first Admin
// before serving anything.
await startServer()

if (import.meta.env.PROD) {
  const hooks = (await import("nitro/app")).useNitroHooks()
  hooks.hook("close", async () => {
    // A reply can be waiting for a sync; stop syncs after replies have settled.
    await replies.drain()
    await getRepositorySync().shutdown()
    // Requests already sent finish; queued deliveries resume after restart.
    await getWebhookDispatcher().stop()
    closeDb()
  })
}

export default createServerEntry({
  fetch(request, opts) {
    if (replies.stopping)
      return new Response("Agent 6 is restarting.", {
        status: 503,
        headers: { "Retry-After": "5" },
      })
    // Use the configured public origin behind TLS termination. Never trust an
    // arbitrary forwarded host/scheme; browser Origin headers stay unchanged.
    return handler.fetch(publicRequest(request, getConfig().baseUrl), opts)
  },
})
