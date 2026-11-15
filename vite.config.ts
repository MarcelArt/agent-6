import { defineConfig, isRunnableDevEnvironment } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import type { Plugin } from "vite"

/**
 * The dev server loads the server entry on the first request. Load it when
 * the dev server starts instead, so configuration is validated and the
 * database is migrated at start, as in production.
 */
function startupOnDevServerStart(): Plugin {
  return {
    name: "agent6:startup",
    apply: "serve",
    configureServer(server) {
      return async () => {
        const ssr = server.environments.ssr
        if (isRunnableDevEnvironment(ssr)) {
          await ssr.runner.import("/src/server.ts")
        }
      }
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "node_server" }),
    viteReact(),
    startupOnDevServerStart(),
  ],
})

export default config
