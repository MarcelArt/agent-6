import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { startup } from "./server/startup"

// Validate configuration and migrate the database before serving anything.
startup()

export default createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts)
  },
})
