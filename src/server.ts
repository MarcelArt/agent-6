import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { startServer } from "./server/startup"

// Validate configuration, migrate the database and create the first Admin
// before serving anything.
await startServer()

export default createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts)
  },
})
