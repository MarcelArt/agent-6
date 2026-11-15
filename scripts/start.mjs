// Nitro loads the Start service lazily. Initialize it before opening the listener
// so invalid configuration fails immediately and migrations run before traffic.
await import("../.output/server/_ssr/ssr.mjs")
await import("../.output/server/index.mjs")
