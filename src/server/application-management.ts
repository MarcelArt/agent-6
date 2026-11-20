import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { createApplicationsRepository } from "./repositories/applications"
import { createRepositoriesRepository } from "./repositories/repositories"
import { requireAdmin, requireSession } from "./session"
import type { Auth } from "./auth"
import type { ApplicationsRepository } from "./repositories/applications"
import type { RepositoriesRepository } from "./repositories/repositories"
import type { ApplicationField, ApplicationInput } from "@/lib/applications"
import {
  APPLICATIONS_PAGE_SIZE,
  MAX_APPLICATION_DESCRIPTION,
  MAX_APPLICATION_NAME,
  MAX_APPLICATION_NOTES,
} from "@/lib/applications"

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly field?: ApplicationField,
    /** For the API: 404 missing, 409 conflict; 400 otherwise. */
    public readonly status = 400
  ) {
    super(message)
    this.name = "ApplicationError"
  }
}
/** The rules every saved Application follows, also applied to imported ones. */
export function validApplicationInput(
  input: ApplicationInput
): ApplicationInput {
  const value = {
    name: input.name.trim(),
    description: input.description.trim(),
    notes: input.notes.trim(),
  }
  if (!value.name)
    throw new ApplicationError("Enter a name for this Application.", "name")
  for (const [field, limit] of [
    ["name", MAX_APPLICATION_NAME],
    ["description", MAX_APPLICATION_DESCRIPTION],
    ["notes", MAX_APPLICATION_NOTES],
  ] as const) {
    if (value[field].length > limit)
      throw new ApplicationError(
        `The ${field} can have at most ${limit} characters. Shorten it, then save again.`,
        field
      )
  }
  return value
}

type ApplicationDeps = {
  applications?: ApplicationsRepository
  repositories?: RepositoriesRepository
}

/**
 * The changes to Applications and their Repository Attachments, shared by the
 * Admin screens and the API. Callers authorize first.
 */
export function createApplicationActions(deps: ApplicationDeps = {}) {
  const applications = deps.applications ?? createApplicationsRepository()
  const repositories = deps.repositories ?? createRepositoriesRepository()
  function existing(id: string) {
    const found = applications.findById(id)
    if (!found)
      throw new ApplicationError(
        "This Application no longer exists. Go back to the list of Applications.",
        undefined,
        404
      )
    return found
  }
  return {
    existing,
    create(input: ApplicationInput) {
      return applications.create(validApplicationInput(input))
    },
    update(applicationId: string, input: ApplicationInput) {
      existing(applicationId)
      applications.update(applicationId, validApplicationInput(input))
      return existing(applicationId)
    },
    /** Saved Conversations protect an Application from removal. */
    remove(applicationId: string) {
      if (applications.hasConversations(applicationId))
        throw new ApplicationError(
          "This Application has saved Conversations and cannot be removed.",
          undefined,
          409
        )
      applications.delete(applicationId)
    },
    attachRepository(applicationId: string, repositoryId: string) {
      existing(applicationId)
      if (!repositories.findById(repositoryId))
        throw new ApplicationError(
          "This Repository no longer exists. Choose another Repository.",
          undefined,
          404
        )
      applications.attachRepository(applicationId, repositoryId)
    },
    detachRepository(applicationId: string, repositoryId: string) {
      existing(applicationId)
      applications.detachRepository(applicationId, repositoryId)
    },
  }
}

export function createApplicationManagement(
  deps: ApplicationDeps & { auth?: Auth } = {}
) {
  const auth = deps.auth ?? getAuth()
  const applications = deps.applications ?? createApplicationsRepository()
  const actions = createApplicationActions({ ...deps, applications })
  const { existing } = actions
  return {
    async list(
      headers: Headers,
      options: { search?: string; page?: number } = {}
    ) {
      await requireAdmin({ auth, headers })
      const total = applications.count(options.search)
      const pageSize = APPLICATIONS_PAGE_SIZE
      const page = Math.min(
        Math.max(1, options.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      return {
        applications: applications.list({
          search: options.search,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        total,
        page,
        pageSize,
      }
    },
    /** The sole scope resolver for agent tools. Every logged-in user may use it. */
    async getApplicationScope(headers: Headers, applicationId: string) {
      await requireSession({ auth, headers })
      return applications.scope(applicationId)
    },
    /** The Admin's view, which also lists Attachments of Needs Secret connections. */
    async get(headers: Headers, applicationId: string) {
      await requireAdmin({ auth, headers })
      return applications.scope(applicationId, { includeNeedsSecret: true })
    },
    async create(headers: Headers, input: ApplicationInput) {
      await requireAdmin({ auth, headers })
      return actions.create(input)
    },
    async update(
      headers: Headers,
      applicationId: string,
      input: ApplicationInput
    ) {
      await requireAdmin({ auth, headers })
      return actions.update(applicationId, input)
    },
    async remove(headers: Headers, applicationId: string) {
      await requireAdmin({ auth, headers })
      actions.remove(applicationId)
    },
    async availableRepositories(
      headers: Headers,
      applicationId: string,
      options: { search?: string; page?: number }
    ) {
      await requireAdmin({ auth, headers })
      existing(applicationId)
      return applications.availableRepositories(applicationId, options)
    },
    async attachRepository(
      headers: Headers,
      applicationId: string,
      repositoryId: string
    ) {
      await requireAdmin({ auth, headers })
      actions.attachRepository(applicationId, repositoryId)
    },
    async detachRepository(
      headers: Headers,
      applicationId: string,
      repositoryId: string
    ) {
      await requireAdmin({ auth, headers })
      actions.detachRepository(applicationId, repositoryId)
    },
  }
}
