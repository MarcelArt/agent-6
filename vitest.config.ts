import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests pass their own databases. Anything that still falls back to the
    // configured one gets a throwaway directory, never the local DATA_DIR.
    env: { DATA_DIR: join(tmpdir(), `agent6-vitest-${process.pid}`) },
  },
})
