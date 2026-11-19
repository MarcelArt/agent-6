import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import {
  ApplicationError,
  validApplicationInput,
} from "./application-management"
import {
  DatabaseConnectionError,
  createDatabaseConnectionManagement,
  validDatabaseConnectionInput,
} from "./database-connection-management"
import {
  LogConnectionError,
  canonicalLogBaseUrl,
  createLogConnectionManagement,
  validLogConnectionInput,
} from "./log-connection-management"
import {
  RepositoryError,
  configuredGitHub,
  createGitHubChecks,
  parseRepositoryReference,
  validRepositoryInput,
} from "./repository-management"
import { createSetupFileRepository } from "./repositories/setup-file"
import { getRepositorySync } from "./repository-sync"
import { decrypt, encrypt } from "./secrets"
import { requireAdmin } from "./session"
import type { Auth } from "./auth"
import type { GitHub } from "./github"
import type { RepositorySync } from "./repository-sync"
import type {
  SetupFileRepository,
  SetupSnapshot,
} from "./repositories/setup-file"
import type { Application } from "@/lib/applications"
import type { ConnectionTest } from "@/lib/database-connections"
import { NEEDS_PASSWORD_TEST } from "@/lib/database-connections"
import type { LogConnectionTest } from "@/lib/log-connections"
import {
  SelectorError,
  formatSelector,
  needsSecretTest,
  parseSelector,
} from "@/lib/log-connections"
import type {
  ResourceCounts,
  SetupFile,
  SetupFileDatabaseConnection,
  SetupFileDifference,
  SetupFileExportOptions,
  SetupFileExportResult,
  SetupFileImportSummary,
  SetupFileLogConnection,
  SetupFilePreview,
  SetupFilePreviewApplication,
  SetupFilePreviewAttachment,
  SetupFilePreviewRecord,
  SetupFileProblem,
  SetupFileRepository as FileRepository,
} from "@/lib/setup-file"
import {
  SETUP_FILE_FORMAT,
  SETUP_FILE_VERSION,
  parseSetupFile,
  setupFileName,
} from "@/lib/setup-file"

/*
 * Setup File export and import (ADR 0005). An import only adds records and
 * Attachments: whatever already exists is matched by natural identity and
 * reused unchanged. Connections that had a secret arrive Needs Secret.
 */

/** A refused export or an unreadable file, in words for the Admin. */
export class SetupFileError extends Error {
  constructor(
    message: string,
    public readonly problems: Array<string> = []
  ) {
    super(message)
    this.name = "SetupFileError"
  }
}

/* Natural identity */

const repositoryKey = (fullName: string) => fullName.trim().toLowerCase()
function databaseKey(item: {
  host: string
  port: number
  database: string
  user: string
}) {
  return JSON.stringify([
    item.host.trim().toLowerCase(),
    item.port,
    item.database.trim(),
    item.user.trim(),
  ])
}
/** `baseUrl` must already be in its stored form. */
const logKey = (item: { baseUrl: string; tenantId: string }) =>
  JSON.stringify([item.baseUrl, item.tenantId.trim()])
const applicationKey = (name: string) => name.trim().toLowerCase()

const databaseIdentity = (item: {
  host: string
  port: number
  database: string
  user: string
}) => `${item.user}@${item.host}:${item.port}/${item.database}`
const logIdentity = (item: { baseUrl: string; tenantId: string }) =>
  item.tenantId ? `${item.baseUrl} (tenant ${item.tenantId})` : item.baseUrl

const tagsText = (tags: Array<string>) => tags.join(", ") || "none"
const blank = (text: string) => text || "empty"

function differences(
  pairs: Array<[label: string, file: string, existing: string]>
): Array<SetupFileDifference> {
  return pairs
    .filter(([, file, existing]) => file !== existing)
    .map(([label, file, existing]) => ({ label, file, existing }))
}

/** A validation message from a form, worded for a file. */
function fix(error: unknown) {
  if (
    error instanceof RepositoryError ||
    error instanceof DatabaseConnectionError ||
    error instanceof LogConnectionError ||
    error instanceof ApplicationError ||
    error instanceof SelectorError
  )
    return `${error.message} Correct the file, then upload it again.`
  throw error
}

/* What an import would do */

type RepositoryPlan = {
  file: FileRepository
  fullName: string
  input: { trackedBranch: string; tags: Array<string>; description: string }
  existingId?: string
  /** Set once created. */
  id?: string
}
type DatabasePlan = {
  input: Omit<SetupFileDatabaseConnection, "hasPassword">
  needsSecret: boolean
  existingId?: string
  id?: string
}
type LogPlan = {
  input: SetupFileLogConnection
  needsSecret: boolean
  existingId?: string
  id?: string
}
type ApplicationPlan = {
  input: { name: string; description: string; notes: string }
  existingId?: string
  id?: string
  /** The Attachments it does not have yet. */
  attach: Array<
    | { kind: "repository"; target: RepositoryPlan }
    | { kind: "database-connection"; target: DatabasePlan }
    | { kind: "log-connection"; target: LogPlan; baseSelector: string }
  >
}
type Plan = {
  preview: SetupFilePreview
  repositories: Array<RepositoryPlan>
  databaseConnections: Array<DatabasePlan>
  logConnections: Array<LogPlan>
  applications: Array<ApplicationPlan>
}

/**
 * GitHub's answer for a Repository of the file that matched nothing here by
 * its own name: its current name, or why it cannot be added.
 */
type GitHubAnswer = { fullName: string } | { problem: string }

/** Matches the file against this instance and validates it. Writes nothing. */
function planImport(
  file: SetupFile,
  snapshot: SetupSnapshot,
  github: Map<string, GitHubAnswer>
): Plan {
  const problems: Array<SetupFileProblem> = []
  const problem = (record: string, message: string) =>
    problems.push({ record, message })
  const preview: SetupFilePreview = {
    repositories: [],
    databaseConnections: [],
    logConnections: [],
    applications: [],
    problems,
    changes: false,
  }

  // Repositories, by "owner/name" as GitHub spells it now.
  const localRepository = new Map(
    [...snapshot.repositories]
      .reverse()
      .map((item) => [repositoryKey(item.fullName), item])
  )
  const repositoriesByFileName = new Map<string, RepositoryPlan>()
  const repositoriesByName = new Map<string, string>()
  const repositories: Array<RepositoryPlan> = []
  for (const item of file.repositories) {
    const label = `Repository ${item.fullName.trim()}`
    const parsed = parseRepositoryReference(item.fullName)
    if (!parsed) {
      problem(
        label,
        "This is not a GitHub repository name of the form owner/name. Correct the file, then upload it again."
      )
      continue
    }
    const fileName = `${parsed.owner}/${parsed.name}`
    if (repositoriesByFileName.has(repositoryKey(fileName))) {
      problem(
        label,
        `The file lists ${fileName} more than once. Remove the extra entry, then upload the file again.`
      )
      continue
    }
    let input: RepositoryPlan["input"]
    try {
      input = validRepositoryInput(item)
    } catch (error) {
      problem(label, fix(error))
      continue
    }
    let local = localRepository.get(repositoryKey(fileName))
    let fullName = local?.fullName ?? fileName
    if (!local) {
      const answer = github.get(repositoryKey(fileName))
      if (!answer) {
        problem(
          label,
          `${fileName} was removed from this instance while you were importing. Upload the file again.`
        )
        continue
      }
      if ("problem" in answer) {
        problem(label, answer.problem)
        continue
      }
      fullName = answer.fullName
      local = localRepository.get(repositoryKey(fullName))
    }
    const twin = repositoriesByName.get(repositoryKey(fullName))
    if (twin) {
      problem(
        label,
        `${fileName} and ${twin} are the same repository on GitHub, now named ${fullName}. Remove one of them from the file, then upload it again.`
      )
      continue
    }
    repositoriesByName.set(repositoryKey(fullName), fileName)
    const plan: RepositoryPlan = {
      file: item,
      fullName,
      input,
      existingId: local?.id,
    }
    repositories.push(plan)
    repositoriesByFileName.set(repositoryKey(fileName), plan)
    preview.repositories.push({
      kind: "repository",
      name: fileName,
      detail:
        !local && fullName !== fileName
          ? `Tracked Branch ${input.trackedBranch} · now ${fullName} on GitHub`
          : `Tracked Branch ${input.trackedBranch}`,
      status: local ? "existing" : "new",
      differences: local
        ? differences([
            ["Name", fileName, local.fullName],
            ["Tracked Branch", input.trackedBranch, local.trackedBranch],
            ["Tags", tagsText(input.tags), tagsText(local.tags)],
            ["Description", blank(input.description), blank(local.description)],
          ])
        : [],
      needsSecret: false,
    })
  }

  // Database Connections, by host (ignoring case), port, database and user.
  const localDatabase = new Map(
    [...snapshot.databaseConnections]
      .reverse()
      .map((item) => [databaseKey(item), item])
  )
  const databaseConnections: Array<DatabasePlan> = []
  const databasesByKey = new Map<string, DatabasePlan>()
  for (const item of file.databaseConnections) {
    const label = `Database Connection ${item.name.trim()}`
    let value: ReturnType<typeof validDatabaseConnectionInput>
    try {
      value = validDatabaseConnectionInput({ ...item, password: "" })
    } catch (error) {
      problem(label, fix(error))
      continue
    }
    const key = databaseKey(value)
    if (databasesByKey.has(key)) {
      problem(
        label,
        `The file lists more than one Database Connection for ${databaseIdentity(value)}. Remove the extra entry, then upload the file again.`
      )
      continue
    }
    const { password: _password, ...input } = value
    const local = localDatabase.get(key)
    const plan: DatabasePlan = {
      input,
      needsSecret: item.hasPassword,
      existingId: local?.id,
    }
    databaseConnections.push(plan)
    databasesByKey.set(key, plan)
    preview.databaseConnections.push({
      kind: "database-connection",
      name: input.name,
      detail: databaseIdentity(input),
      status: local ? "existing" : "new",
      differences: local
        ? differences([
            ["Name", input.name, local.name],
            ["SSL mode", input.sslMode, local.sslMode],
            ["Tags", tagsText(input.tags), tagsText(local.tags)],
            ["Description", blank(input.description), blank(local.description)],
          ])
        : [],
      needsSecret: !local && item.hasPassword,
    })
  }

  // Log Connections, by stored base URL and tenant ID.
  const localLog = new Map(
    [...snapshot.logConnections].reverse().map((item) => [logKey(item), item])
  )
  const logConnections: Array<LogPlan> = []
  const logsByKey = new Map<string, LogPlan>()
  for (const item of file.logConnections) {
    const label = `Log Connection ${item.name.trim()}`
    let value: ReturnType<typeof validLogConnectionInput>
    try {
      value = validLogConnectionInput({ ...item, authSecret: "" })
    } catch (error) {
      problem(label, fix(error))
      continue
    }
    const key = logKey(value)
    if (logsByKey.has(key)) {
      problem(
        label,
        `The file lists more than one Log Connection for ${logIdentity(value)}. Remove the extra entry, then upload the file again.`
      )
      continue
    }
    const { authSecret: _secret, ...input } = value
    const local = localLog.get(key)
    const plan: LogPlan = {
      input,
      needsSecret: input.authType !== "none",
      existingId: local?.id,
    }
    logConnections.push(plan)
    logsByKey.set(key, plan)
    preview.logConnections.push({
      kind: "log-connection",
      name: input.name,
      detail: logIdentity(input),
      status: local ? "existing" : "new",
      differences: local
        ? differences([
            ["Name", input.name, local.name],
            ["Auth header", input.authType, local.authType],
            ["Username", blank(input.authUsername), blank(local.authUsername)],
            ["Tags", tagsText(input.tags), tagsText(local.tags)],
            ["Description", blank(input.description), blank(local.description)],
          ])
        : [],
      needsSecret: !local && plan.needsSecret,
    })
  }

  // Applications, by name, trimmed and ignoring case.
  const localApplications = new Map<string, Array<Application>>()
  for (const item of snapshot.applications) {
    const key = applicationKey(item.name)
    localApplications.set(key, [...(localApplications.get(key) ?? []), item])
  }
  const has = <T extends { applicationId: string }>(
    rows: Array<T>,
    applicationId: string | undefined,
    match: (row: T) => boolean
  ) =>
    applicationId !== undefined &&
    rows.some((row) => row.applicationId === applicationId && match(row))
  const applications: Array<ApplicationPlan> = []
  const applicationNames = new Set<string>()
  for (const item of file.applications) {
    const label = `Application ${item.name.trim()}`
    let input: ApplicationPlan["input"]
    try {
      input = validApplicationInput(item)
    } catch (error) {
      problem(label, fix(error))
      continue
    }
    const key = applicationKey(input.name)
    if (applicationNames.has(key)) {
      problem(
        label,
        `The file has more than one Application named ${input.name}. Remove or rename the extra one, then upload the file again.`
      )
      continue
    }
    applicationNames.add(key)
    const matches = localApplications.get(key) ?? []
    if (matches.length > 1) {
      problem(
        label,
        `${matches.length} Applications here are named ${input.name}, so Agent 6 cannot tell which one to add to. Rename all but one of them, then upload the file again.`
      )
      continue
    }
    const local = matches.at(0)
    const plan: ApplicationPlan = { input, existingId: local?.id, attach: [] }
    const attachments: Array<SetupFilePreviewAttachment> = []
    const seen = new Set<RepositoryPlan | DatabasePlan | LogPlan>()
    for (const reference of new Set(item.repositories)) {
      const parsed = parseRepositoryReference(reference)
      const target =
        parsed &&
        repositoriesByFileName.get(
          repositoryKey(`${parsed.owner}/${parsed.name}`)
        )
      if (!target) {
        // A Repository the file lists but that has a problem is reported once.
        if (
          !file.repositories.some(
            (entry) =>
              repositoryKey(entry.fullName) === repositoryKey(reference)
          )
        )
          problem(
            label,
            `${input.name} is attached to the Repository ${reference}, which the file does not list. Add it to the file's repositories or remove the Attachment, then upload the file again.`
          )
        continue
      }
      if (seen.has(target)) continue
      seen.add(target)
      const exists = has(
        snapshot.repositoryAttachments,
        local?.id,
        (row) => row.repositoryId === target.existingId
      )
      if (!exists) plan.attach.push({ kind: "repository", target })
      attachments.push({
        kind: "repository",
        name: target.fullName,
        status: exists ? "existing" : "new",
      })
    }
    for (const reference of item.databaseConnections) {
      const target = databasesByKey.get(databaseKey(reference))
      if (!target) {
        if (
          !file.databaseConnections.some(
            (entry) => databaseKey(entry) === databaseKey(reference)
          )
        )
          problem(
            label,
            `${input.name} is attached to the Database Connection for ${databaseIdentity(reference)}, which the file does not list. Add it to the file's databaseConnections or remove the Attachment, then upload the file again.`
          )
        continue
      }
      if (seen.has(target)) continue
      seen.add(target)
      const exists = has(
        snapshot.databaseConnectionAttachments,
        local?.id,
        (row) => row.databaseConnectionId === target.existingId
      )
      if (!exists) plan.attach.push({ kind: "database-connection", target })
      attachments.push({
        kind: "database-connection",
        name: target.input.name,
        status: exists ? "existing" : "new",
      })
    }
    for (const reference of item.logConnections) {
      let baseUrl: string
      try {
        baseUrl = canonicalLogBaseUrl(reference.baseUrl)
      } catch (error) {
        problem(label, fix(error))
        continue
      }
      const target = logsByKey.get(logKey({ ...reference, baseUrl }))
      if (!target) {
        if (
          !file.logConnections.some((entry) => {
            try {
              return (
                logKey({
                  ...entry,
                  baseUrl: canonicalLogBaseUrl(entry.baseUrl),
                }) === logKey({ ...reference, baseUrl })
              )
            } catch {
              return false
            }
          })
        )
          problem(
            label,
            `${input.name} is attached to the Log Connection for ${logIdentity({ ...reference, baseUrl })}, which the file does not list. Add it to the file's logConnections or remove the Attachment, then upload the file again.`
          )
        continue
      }
      if (seen.has(target)) continue
      seen.add(target)
      let baseSelector: string
      try {
        baseSelector = formatSelector(parseSelector(reference.baseSelector))
      } catch (error) {
        problem(
          label,
          `The Base Selector of ${input.name} for ${target.input.name} is invalid. ${fix(error)}`
        )
        continue
      }
      const existing = local
        ? snapshot.logConnectionAttachments.find(
            (row) =>
              row.applicationId === local.id &&
              row.logConnectionId === target.existingId
          )
        : undefined
      // An existing Log Attachment keeps its own Base Selector.
      if (!existing)
        plan.attach.push({ kind: "log-connection", target, baseSelector })
      attachments.push({
        kind: "log-connection",
        name: target.input.name,
        status: existing ? "existing" : "new",
        baseSelector,
        ...(existing && existing.baseSelector !== baseSelector
          ? { existingBaseSelector: existing.baseSelector }
          : {}),
      })
    }
    applications.push(plan)
    const record: SetupFilePreviewApplication = {
      kind: "application",
      name: input.name,
      detail: `${attachments.length} ${attachments.length === 1 ? "Attachment" : "Attachments"}`,
      status: local ? "existing" : "new",
      differences: local
        ? differences([
            ["Name", input.name, local.name],
            ["Description", blank(input.description), blank(local.description)],
            ["Notes", blank(input.notes), blank(local.notes)],
          ])
        : [],
      needsSecret: false,
      attachments,
    }
    preview.applications.push(record)
  }

  const records: Array<SetupFilePreviewRecord> = [
    ...preview.repositories,
    ...preview.databaseConnections,
    ...preview.logConnections,
    ...preview.applications,
  ]
  preview.changes =
    records.some((record) => record.status === "new") ||
    preview.applications.some((record) =>
      record.attachments.some((item) => item.status === "new")
    )
  return {
    preview,
    repositories,
    databaseConnections,
    logConnections,
    applications,
  }
}

/** Runs `work` on each item, a few at a time. */
async function inBatches<T>(
  items: Array<T>,
  work: (item: T) => Promise<void>,
  size = 4
) {
  for (let start = 0; start < items.length; start += size)
    await Promise.all(items.slice(start, start + size).map(work))
}

const UNTESTED_DATABASE: ConnectionTest = {
  ok: false,
  writable: null,
  message: "Not tested yet. Test the connection to check it.",
}
const UNTESTED_LOG: LogConnectionTest = {
  ok: false,
  message: "Not tested yet. Test the connection to check it.",
}

export function createSetupFileManagement(
  deps: {
    auth?: Auth
    store?: SetupFileRepository
    /** Undefined when `GITHUB_TOKEN` is not set. */
    github?: GitHub
    sync?: Pick<RepositorySync, "sync">
    /** Tests a new connection after an import and records the result. */
    testDatabaseConnection?: (headers: Headers, id: string) => Promise<unknown>
    testLogConnection?: (headers: Headers, id: string) => Promise<unknown>
    now?: () => Date
  } = {}
) {
  const auth = deps.auth ?? getAuth()
  const store = deps.store ?? createSetupFileRepository()
  const checks = createGitHubChecks(
    "github" in deps ? deps.github : configuredGitHub()
  )
  const admin = (headers: Headers) => requireAdmin({ auth, headers })
  const testDatabase =
    deps.testDatabaseConnection ??
    ((headers: Headers, id: string) =>
      createDatabaseConnectionManagement({
        auth,
        connections: store.databaseConnections,
        applications: store.applications,
      }).test(headers, id))
  const testLog =
    deps.testLogConnection ??
    ((headers: Headers, id: string) =>
      createLogConnectionManagement({
        auth,
        connections: store.logConnections,
        applications: store.applications,
      }).test(headers, id))

  function read(text: string): SetupFile {
    const parsed = parseSetupFile(text)
    if (!parsed.ok) throw new SetupFileError(parsed.message)
    return parsed.file
  }

  /**
   * Asks GitHub about each Repository of the file that matches nothing here
   * by its own name: whether the token can read it, its current name, and,
   * when that is new too, whether its Tracked Branch exists.
   */
  async function askGitHub(file: SetupFile, snapshot: SetupSnapshot) {
    const local = new Set(
      snapshot.repositories.map((item) => repositoryKey(item.fullName))
    )
    const answers = new Map<string, GitHubAnswer>()
    const pending = file.repositories.flatMap((item) => {
      const parsed = parseRepositoryReference(item.fullName)
      if (!parsed) return []
      const key = repositoryKey(`${parsed.owner}/${parsed.name}`)
      if (local.has(key)) return []
      try {
        // An invalid record is reported without asking GitHub.
        return [{ item, key, input: validRepositoryInput(item) }]
      } catch {
        return []
      }
    })
    await inBatches(pending, async ({ item, key, input }) => {
      if (answers.has(key)) return
      try {
        const found = await checks.lookUp(item.fullName)
        if (!local.has(repositoryKey(found.fullName)))
          await checks.requireBranch(found.fullName, input.trackedBranch)
        answers.set(key, { fullName: found.fullName })
      } catch (error) {
        if (!(error instanceof RepositoryError)) throw error
        answers.set(key, { problem: error.message })
      }
    })
    return answers
  }

  async function check(text: string) {
    const file = read(text)
    const github = await askGitHub(file, store.snapshot())
    return { file, github }
  }

  /** Creates what the plan says is new. Runs inside the transaction. */
  function write(plan: Plan) {
    for (const item of plan.repositories)
      if (!item.existingId)
        item.id = store.repositories.create({
          fullName: item.fullName,
          ...item.input,
        }).id
    for (const item of plan.databaseConnections)
      if (!item.existingId)
        item.id = store.databaseConnections.create(
          {
            ...item.input,
            encryptedPassword: item.needsSecret ? null : encrypt(""),
          },
          item.needsSecret ? NEEDS_PASSWORD_TEST : UNTESTED_DATABASE
        ).id
    for (const item of plan.logConnections)
      if (!item.existingId)
        item.id = store.logConnections.create(
          { ...item.input, encryptedAuthSecret: null },
          item.needsSecret ? needsSecretTest(item.input.authType) : UNTESTED_LOG
        ).id
    let attachments = 0
    for (const item of plan.applications) {
      const applicationId =
        item.existingId ?? store.applications.create(item.input).id
      item.id = applicationId
      for (const attachment of item.attach) {
        const id = attachment.target.existingId ?? attachment.target.id!
        if (attachment.kind === "repository")
          store.applications.attachRepository(applicationId, id)
        else if (attachment.kind === "database-connection")
          store.databaseConnections.attach(applicationId, id)
        else
          store.logConnections.attach(
            applicationId,
            id,
            attachment.baseSelector
          )
        attachments++
      }
    }
    return attachments
  }

  function summary(plan: Plan, attachments: number): SetupFileImportSummary {
    const count = (items: Array<{ existingId?: string }>, created: boolean) =>
      items.filter((item) => !item.existingId === created).length
    const counts = (created: boolean) => ({
      applications: count(plan.applications, created),
      repositories: count(plan.repositories, created),
      databaseConnections: count(plan.databaseConnections, created),
      logConnections: count(plan.logConnections, created),
    })
    return {
      created: counts(true),
      reused: counts(false),
      attachments,
      needsSecret: [...plan.databaseConnections, ...plan.logConnections].filter(
        (item) => !item.existingId && item.needsSecret
      ).length,
    }
  }

  return {
    /** Every Application with what is attached to it, for the Export dialog. */
    async exportOptions(headers: Headers): Promise<SetupFileExportOptions> {
      await admin(headers)
      const snapshot = store.snapshot()
      const ids = <T extends { applicationId: string }>(
        rows: Array<T>,
        applicationId: string,
        id: (row: T) => string
      ) => rows.filter((row) => row.applicationId === applicationId).map(id)
      return {
        applications: [...snapshot.applications]
          .sort(
            (a, b) =>
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
              a.id.localeCompare(b.id)
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            repositoryIds: ids(
              snapshot.repositoryAttachments,
              item.id,
              (row) => row.repositoryId
            ),
            databaseConnectionIds: ids(
              snapshot.databaseConnectionAttachments,
              item.id,
              (row) => row.databaseConnectionId
            ),
            logConnectionIds: ids(
              snapshot.logConnectionAttachments,
              item.id,
              (row) => row.logConnectionId
            ),
          })),
        totals: {
          repositories: snapshot.repositories.length,
          databaseConnections: snapshot.databaseConnections.length,
          logConnections: snapshot.logConnections.length,
        },
      }
    },

    /**
     * The chosen Applications with every resource attached to at least one
     * of them, their Attachments and Base Selectors. Never a secret or an id.
     */
    async export(
      headers: Headers,
      applicationIds: Array<string>
    ): Promise<Extract<SetupFileExportResult, { ok: true }>> {
      await admin(headers)
      if (!applicationIds.length)
        throw new SetupFileError("Choose at least one Application to export.")
      const snapshot = store.snapshot()
      const chosen = new Set(applicationIds)
      const applications = snapshot.applications.filter((item) =>
        chosen.has(item.id)
      )
      if (applications.length !== chosen.size)
        throw new SetupFileError(
          "An Application you chose no longer exists. Close Export, open it again and choose again."
        )
      const attachedTo = <T extends { applicationId: string }>(
        rows: Array<T>
      ) => rows.filter((row) => chosen.has(row.applicationId))
      const repositoryRows = attachedTo(snapshot.repositoryAttachments)
      const databaseRows = attachedTo(snapshot.databaseConnectionAttachments)
      const logRows = attachedTo(snapshot.logConnectionAttachments)
      const repositories = snapshot.repositories.filter((item) =>
        repositoryRows.some((row) => row.repositoryId === item.id)
      )
      const databaseConnections = snapshot.databaseConnections.filter((item) =>
        databaseRows.some((row) => row.databaseConnectionId === item.id)
      )
      const logConnections = snapshot.logConnections.filter((item) =>
        logRows.some((row) => row.logConnectionId === item.id)
      )

      // Import would reject a file with two records of one identity.
      const problems: Array<string> = []
      const twins = <T>(
        items: Array<T>,
        key: (item: T) => string,
        describe: (group: Array<T>) => string
      ) => {
        const groups = new Map<string, Array<T>>()
        for (const item of items)
          groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
        for (const group of groups.values())
          if (group.length > 1) problems.push(describe(group))
      }
      const names = (group: Array<{ name: string }>) =>
        group.map((item) => `"${item.name}"`).join(" and ")
      twins(
        applications,
        (item) => applicationKey(item.name),
        (group) =>
          `The Applications ${names(group)} share a name. Rename one of them, or export them separately.`
      )
      twins(
        repositories,
        (item) => repositoryKey(item.fullName),
        (group) =>
          `The Repositories ${group.map((item) => item.fullName).join(" and ")} share a name.`
      )
      twins(
        databaseConnections,
        databaseKey,
        (group) =>
          `The Database Connections ${names(group)} both connect to ${databaseIdentity(group[0])}. Attach only one of them to the chosen Applications.`
      )
      twins(
        logConnections,
        logKey,
        (group) =>
          `The Log Connections ${names(group)} both read ${logIdentity(group[0])}. Attach only one of them to the chosen Applications.`
      )
      if (problems.length)
        throw new SetupFileError(
          "This Setup File could not be imported anywhere, so nothing was exported.",
          problems
        )

      const byName = <T>(items: Array<T>, name: (item: T) => string) =>
        [...items].sort((a, b) =>
          name(a).toLowerCase().localeCompare(name(b).toLowerCase())
        )
      const exportedAt = (deps.now?.() ?? new Date()).toISOString()
      const file: SetupFile = {
        format: SETUP_FILE_FORMAT,
        version: SETUP_FILE_VERSION,
        exportedAt,
        repositories: byName(repositories, (item) => item.fullName).map(
          (item) => ({
            fullName: item.fullName,
            trackedBranch: item.trackedBranch,
            tags: item.tags,
            description: item.description,
          })
        ),
        databaseConnections: byName(
          databaseConnections,
          (item) => item.name
        ).map((item) => ({
          name: item.name,
          host: item.host,
          port: item.port,
          database: item.database,
          user: item.user,
          sslMode: item.sslMode,
          hasPassword: hasPassword(
            store.databaseConnections.credentials(item.id)?.encryptedPassword
          ),
          tags: item.tags,
          description: item.description,
        })),
        logConnections: byName(logConnections, (item) => item.name).map(
          (item) => ({
            name: item.name,
            baseUrl: item.baseUrl,
            authType: item.authType,
            authUsername: item.authUsername,
            tenantId: item.tenantId,
            tags: item.tags,
            description: item.description,
          })
        ),
        applications: byName(applications, (item) => item.name).map(
          (application) => ({
            name: application.name,
            description: application.description,
            notes: application.notes,
            repositories: byName(
              repositories.filter((item) =>
                repositoryRows.some(
                  (row) =>
                    row.applicationId === application.id &&
                    row.repositoryId === item.id
                )
              ),
              (item) => item.fullName
            ).map((item) => item.fullName),
            databaseConnections: byName(
              databaseConnections.filter((item) =>
                databaseRows.some(
                  (row) =>
                    row.applicationId === application.id &&
                    row.databaseConnectionId === item.id
                )
              ),
              (item) => item.name
            ).map(({ host, port, database, user }) => ({
              host,
              port,
              database,
              user,
            })),
            logConnections: byName(
              logConnections.flatMap((item) => {
                const row = logRows.find(
                  (entry) =>
                    entry.applicationId === application.id &&
                    entry.logConnectionId === item.id
                )
                return row ? [{ ...item, baseSelector: row.baseSelector }] : []
              }),
              (item) => item.name
            ).map(({ baseUrl, tenantId, baseSelector }) => ({
              baseUrl,
              tenantId,
              baseSelector,
            })),
          })
        ),
      }
      const leftOut: ResourceCounts = {
        repositories: snapshot.repositories.length - repositories.length,
        databaseConnections:
          snapshot.databaseConnections.length - databaseConnections.length,
        logConnections: snapshot.logConnections.length - logConnections.length,
      }
      return { ok: true, file, fileName: setupFileName(exportedAt), leftOut }
    },

    /** What importing `text` would do, and what blocks it. Writes nothing. */
    async preview(headers: Headers, text: string): Promise<SetupFilePreview> {
      await admin(headers)
      const { file, github } = await check(text)
      return planImport(file, store.snapshot(), github).preview
    },

    /**
     * Repeats every check and writes all new records and Attachments in one
     * transaction, or nothing and the new preview. GitHub is asked before
     * the transaction opens.
     */
    async import(
      headers: Headers,
      text: string
    ): Promise<
      | { ok: true; summary: SetupFileImportSummary }
      | { ok: false; preview: SetupFilePreview }
    > {
      await admin(headers)
      const { file, github } = await check(text)
      const result = store.transaction(() => {
        const plan = planImport(file, store.snapshot(), github)
        if (plan.preview.problems.length)
          return { ok: false as const, preview: plan.preview }
        return { ok: true as const, plan, attachments: write(plan) }
      })
      if (!result.ok) return result
      const { plan, attachments } = result
      for (const item of plan.repositories)
        if (item.id) void (deps.sync ?? getRepositorySync()).sync(item.id)
      // A failed test is recorded on the connection; it never undoes the import.
      await Promise.allSettled([
        ...plan.databaseConnections
          .filter((item) => item.id && !item.needsSecret)
          .map((item) => testDatabase(headers, item.id!)),
        ...plan.logConnections
          .filter((item) => item.id && !item.needsSecret)
          .map((item) => testLog(headers, item.id!)),
      ])
      return { ok: true, summary: summary(plan, attachments) }
    },
  }
}

/** Whether a source connection's password was non-empty, without exporting it. */
function hasPassword(encrypted: string | null | undefined) {
  if (encrypted === null || encrypted === undefined) return true
  try {
    return decrypt(encrypted) !== ""
  } catch {
    // Unreadable here; assume the target needs one.
    return true
  }
}
