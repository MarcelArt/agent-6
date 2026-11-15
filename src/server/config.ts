import "@tanstack/react-start/server-only"

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"

/**
 * The one place environment variables are read and validated.
 * Later steps add their variables to `schema`.
 */
const schema = z.object({
  DATA_DIR: z
    .string({
      error: "is required. Set it to the directory that holds Agent 6's data.",
    })
    .trim()
    .min(1, "must not be empty.")
    .transform((dir) => resolve(dir)),
  ENCRYPTION_KEY: z
    .string({
      error: "is required. Generate one with: openssl rand -base64 32",
    })
    .trim()
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      error:
        "must be 32 bytes encoded as base64. Generate one with: openssl rand -base64 32",
    }),
})

export type Config = {
  /** Absolute path of the data directory. */
  dataDir: string
  /** Base64 of the 32-byte key used by `secrets.ts`. */
  encryptionKey: string
}

export class ConfigError extends Error {
  constructor(public readonly problems: Array<string>) {
    super(
      [
        "Agent 6 cannot start: invalid configuration.",
        ...problems.map((problem) => `  - ${problem}`),
        "Set the variables in the environment or in a .env file (see .env.example).",
      ].join("\n")
    )
    this.name = "ConfigError"
  }
}

/** Validates the given environment. Throws a `ConfigError` naming every bad variable. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`
      )
    )
  }
  return {
    dataDir: result.data.DATA_DIR,
    encryptionKey: result.data.ENCRYPTION_KEY,
  }
}

let cached: Config | undefined

/** The validated configuration of this process. Reads `.env` once if present. */
export function getConfig(): Config {
  if (!cached) {
    // Variables already set in the environment win over the file.
    if (existsSync(".env")) process.loadEnvFile(".env")
    cached = parseConfig(process.env)
  }
  return cached
}
