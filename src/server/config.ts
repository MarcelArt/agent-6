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
  BETTER_AUTH_SECRET: z
    .string({
      error: "is required. Generate one with: openssl rand -base64 32",
    })
    .trim()
    .min(
      32,
      "must be at least 32 characters. Generate one with: openssl rand -base64 32"
    ),
  BETTER_AUTH_URL: z
    .string({
      error:
        "is required. Set it to the address people open Agent 6 at, for example http://localhost:3000",
    })
    .trim()
    .pipe(
      z.url({
        protocol: /^https?$/,
        error:
          "must be an http or https address, for example http://localhost:3000",
      })
    ),
  // Only used while no user exists; see `first-admin.ts`, which validates them.
  ADMIN_EMAIL: z.string().trim().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  // Optional so the app still starts without it; see `startup.ts`.
  GITHUB_TOKEN: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().optional(),
  GUARDRAIL_MODEL: z.string().trim().optional(),
  OPENAI_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url({ protocol: /^https?$/ }).optional()
  ),
})

export type Config = {
  /** Absolute path of the data directory. */
  dataDir: string
  /** Base64 of the 32-byte key used by `secrets.ts`. */
  encryptionKey: string
  /** Secret Better Auth signs session cookies with. */
  authSecret: string
  /** Address people open Agent 6 at. */
  baseUrl: string
  /** Credentials of the first Admin. Only used while no user exists. */
  adminEmail?: string
  adminPassword?: string
  /** The one GitHub token, for cloning and for filing issues. */
  githubToken?: string
  openaiApiKey?: string
  openaiModel?: string
  guardrailModel?: string
  openaiBaseUrl?: string
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
    authSecret: result.data.BETTER_AUTH_SECRET,
    baseUrl: result.data.BETTER_AUTH_URL,
    adminEmail: result.data.ADMIN_EMAIL || undefined,
    adminPassword: result.data.ADMIN_PASSWORD || undefined,
    githubToken: result.data.GITHUB_TOKEN || undefined,
    openaiApiKey: result.data.OPENAI_API_KEY || undefined,
    openaiModel: result.data.OPENAI_MODEL || undefined,
    guardrailModel:
      result.data.GUARDRAIL_MODEL || result.data.OPENAI_MODEL || undefined,
    openaiBaseUrl: result.data.OPENAI_BASE_URL,
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
