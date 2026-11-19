import { z } from "zod"
import { SSL_MODES } from "./database-connections"
import { LOG_AUTH_TYPES } from "./log-connections"

/*
 * A Setup File: chosen Applications with the Repositories, Database
 * Connections and Log Connections attached to them. Records refer to each
 * other by natural identity, never by instance ids, and the file never holds
 * a connection secret (ADR 0005). The browser and the server read it with the
 * same parser.
 */

export const SETUP_FILE_FORMAT = "agent6-setup"
/** The version this instance writes, and the newest it reads. */
export const SETUP_FILE_VERSION = 1
export const MAX_SETUP_FILE_BYTES = 1024 * 1024

/*
 * Objects are strict: a key the format does not know, such as a password,
 * makes the whole file invalid instead of being dropped quietly.
 */
const repositoryV1 = z.strictObject({
  /** "owner/name" as GitHub spelled it at export. */
  fullName: z.string(),
  trackedBranch: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
})
const databaseConnectionV1 = z.strictObject({
  name: z.string(),
  host: z.string(),
  port: z.int(),
  database: z.string(),
  user: z.string(),
  sslMode: z.enum(SSL_MODES),
  /** Whether the source connection's password was non-empty. Never the password. */
  hasPassword: z.boolean(),
  tags: z.array(z.string()),
  description: z.string(),
})
const logConnectionV1 = z.strictObject({
  name: z.string(),
  baseUrl: z.string(),
  /** Anything but "none" implies a secret, which the file never holds. */
  authType: z.enum(LOG_AUTH_TYPES),
  authUsername: z.string(),
  tenantId: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
})
const applicationV1 = z.strictObject({
  name: z.string(),
  description: z.string(),
  notes: z.string(),
  /** Attached Repositories, by `fullName`. */
  repositories: z.array(z.string()),
  /** Attached Database Connections, by natural identity. */
  databaseConnections: z.array(
    z.strictObject({
      host: z.string(),
      port: z.int(),
      database: z.string(),
      user: z.string(),
    })
  ),
  /** Attached Log Connections, by natural identity, with the Base Selector. */
  logConnections: z.array(
    z.strictObject({
      baseUrl: z.string(),
      tenantId: z.string(),
      baseSelector: z.string(),
    })
  ),
})
const setupFileV1 = z.strictObject({
  format: z.literal(SETUP_FILE_FORMAT),
  version: z.literal(1),
  exportedAt: z.string(),
  repositories: z.array(repositoryV1),
  databaseConnections: z.array(databaseConnectionV1),
  logConnections: z.array(logConnectionV1),
  applications: z.array(applicationV1),
})

/** The current version's shape; older versions are upgraded to it on read. */
export type SetupFile = z.infer<typeof setupFileV1>
export type SetupFileRepository = SetupFile["repositories"][number]
export type SetupFileDatabaseConnection =
  SetupFile["databaseConnections"][number]
export type SetupFileLogConnection = SetupFile["logConnections"][number]
export type SetupFileApplication = SetupFile["applications"][number]

/**
 * One reader per version this instance can read. A later version adds its
 * schema here with an upgrade from the one before, so old files keep working.
 */
const readers: Record<number, (value: unknown) => SetupFile> = {
  1: (value) => setupFileV1.parse(value),
}

export type SetupFileParseResult =
  { ok: true; file: SetupFile } | { ok: false; message: string }

function where(path: Array<PropertyKey>) {
  return path.reduce<string>(
    (text, key) =>
      typeof key === "number"
        ? `${text}[${key}]`
        : text
          ? `${text}.${String(key)}`
          : String(key),
    ""
  )
}

/** Reads a Setup File, or says what is wrong with it. */
export function parseSetupFile(text: string): SetupFileParseResult {
  if (new TextEncoder().encode(text).length > MAX_SETUP_FILE_BYTES)
    return {
      ok: false,
      message:
        "This file is larger than 1 MB, so it is not a Setup File Agent 6 can import. Upload the file that Export saved.",
    }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return {
      ok: false,
      message:
        "This file is not valid JSON, so it is not a Setup File. Upload the .json file that Export saved, unchanged.",
    }
  }
  const header = (
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : {}
  ) as { format?: unknown; version?: unknown }
  if (header.format !== SETUP_FILE_FORMAT)
    return {
      ok: false,
      message: `This file is not an Agent 6 Setup File: its format is ${typeof header.format === "string" ? `"${header.format}"` : "missing"} instead of "${SETUP_FILE_FORMAT}". Upload the file that Export saved.`,
    }
  const version = header.version
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return {
      ok: false,
      message:
        "This Setup File has no valid version number. Upload the file that Export saved, unchanged.",
    }
  if (version > SETUP_FILE_VERSION)
    return {
      ok: false,
      message: `This Setup File comes from a newer Agent 6 (file version ${version}; this instance reads up to version ${SETUP_FILE_VERSION}). Upgrade this instance, then import the file again.`,
    }
  try {
    return { ok: true, file: readers[version](value) }
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error
    const issues = error.issues
      .slice(0, 3)
      .map((issue) => `${where(issue.path) || "the file"}: ${issue.message}`)
    const more = error.issues.length - issues.length
    return {
      ok: false,
      message: `This Setup File does not match its format. ${issues.join("; ")}${more > 0 ? `; and ${more} more` : ""}. Export it again, or correct the file.`,
    }
  }
}

/** `agent6-setup-2026-11-19.json`, from the export time. */
export function setupFileName(exportedAt: string) {
  return `agent6-setup-${exportedAt.slice(0, 10)}.json`
}

/* Export */

export type ExportableApplication = {
  id: string
  name: string
  repositoryIds: Array<string>
  databaseConnectionIds: Array<string>
  logConnectionIds: Array<string>
}
export type SetupFileExportOptions = {
  applications: Array<ExportableApplication>
  /** How many of each resource the instance has, attached or not. */
  totals: ResourceCounts
}
export type ResourceCounts = {
  repositories: number
  databaseConnections: number
  logConnections: number
}
export type SetupFileExportResult =
  | { ok: true; file: SetupFile; fileName: string; leftOut: ResourceCounts }
  | { ok: false; message: string; problems: Array<string> }

/** The resources the chosen Applications would leave out of the file. */
export function leftOutResources(
  options: SetupFileExportOptions,
  chosen: ReadonlySet<string>
): ResourceCounts {
  const included = {
    repositories: new Set<string>(),
    databaseConnections: new Set<string>(),
    logConnections: new Set<string>(),
  }
  for (const application of options.applications) {
    if (!chosen.has(application.id)) continue
    for (const id of application.repositoryIds) included.repositories.add(id)
    for (const id of application.databaseConnectionIds)
      included.databaseConnections.add(id)
    for (const id of application.logConnectionIds)
      included.logConnections.add(id)
  }
  return {
    repositories: options.totals.repositories - included.repositories.size,
    databaseConnections:
      options.totals.databaseConnections - included.databaseConnections.size,
    logConnections:
      options.totals.logConnections - included.logConnections.size,
  }
}

/** "1 Repository and 2 Log Connections", or "" for none. */
export function describeCounts(counts: ResourceCounts) {
  const parts = [
    [counts.repositories, "Repository", "Repositories"],
    [counts.databaseConnections, "Database Connection", "Database Connections"],
    [counts.logConnections, "Log Connection", "Log Connections"],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "")
}

/* Import */

export type SetupFileRecordKind =
  "repository" | "database-connection" | "log-connection" | "application"

/** A field where the file differs from the record that is reused unchanged. */
export type SetupFileDifference = {
  label: string
  file: string
  existing: string
}

export type SetupFilePreviewRecord = {
  kind: SetupFileRecordKind
  /** Repository `owner/name` or the record's name, as the file has it. */
  name: string
  /** One line that identifies it: branch, host and database, or base URL. */
  detail: string
  status: "new" | "existing"
  /** Fields where the file differs from the record that is reused unchanged. */
  differences: Array<SetupFileDifference>
  /** A new connection that arrives without its secret. */
  needsSecret: boolean
}

export type SetupFilePreviewAttachment = {
  kind: "repository" | "database-connection" | "log-connection"
  name: string
  status: "new" | "existing"
  /** Log Attachments: the Base Selector from the file. */
  baseSelector?: string
  /** An existing Log Attachment's own Base Selector, kept when it differs. */
  existingBaseSelector?: string
}

export type SetupFilePreviewApplication = SetupFilePreviewRecord & {
  attachments: Array<SetupFilePreviewAttachment>
}

/** Something that blocks the whole import, with what to do about it. */
export type SetupFileProblem = { record: string; message: string }

export type SetupFilePreview = {
  repositories: Array<SetupFilePreviewRecord>
  databaseConnections: Array<SetupFilePreviewRecord>
  logConnections: Array<SetupFilePreviewRecord>
  applications: Array<SetupFilePreviewApplication>
  problems: Array<SetupFileProblem>
  /** Whether confirming would create a record or an Attachment. */
  changes: boolean
}

export type SetupFileImportSummary = {
  created: ResourceCounts & { applications: number }
  reused: ResourceCounts & { applications: number }
  /** New Attachments, including those of new Applications. */
  attachments: number
  /** New connections that arrived Needs Secret. */
  needsSecret: number
}

export type SetupFilePreviewResult =
  { ok: true; preview: SetupFilePreview } | { ok: false; message: string }

export type SetupFileImportResult =
  | { ok: true; summary: SetupFileImportSummary }
  /** Nothing was written; the file or the instance needs fixing first. */
  | { ok: false; preview: SetupFilePreview }
  | { ok: false; message: string }
