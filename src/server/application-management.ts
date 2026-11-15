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
    public readonly field?: ApplicationField
  ) {
    super(message)
    this.name = "ApplicationError"
  }
}
function validInput(input: ApplicationInput): ApplicationInput {
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

export function createApplicationManagement(
  deps: {
    auth?: Auth
    applications?: ApplicationsRepository
    repositories?: RepositoriesRepository
  } = {}
) {
  const auth = deps.auth ?? getAuth()
  const applications = deps.applications ?? createApplicationsRepository()
  const repositories = deps.repositories ?? createRepositoriesRepository()
  function existing(id: string) {
    const found = applications.findById(id)
    if (!found)
      throw new ApplicationError(
        "This Application no longer exists. Go back to the list of Applications."
      )
    return found
  }
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
    async get(headers: Headers, applicationId: string) {
      await requireAdmin({ auth, headers })
      return applications.scope(applicationId)
    },
    async create(headers: Headers, input: ApplicationInput) {
      await requireAdmin({ auth, headers })
      return applications.create(validInput(input))
    },
    async update(
      headers: Headers,
      applicationId: string,
      input: ApplicationInput
    ) {
      await requireAdmin({ auth, headers })
      existing(applicationId)
      applications.update(applicationId, validInput(input))
      return existing(applicationId)
    },
    async remove(headers: Headers, applicationId: string) {
      await requireAdmin({ auth, headers })
      if (applications.hasConversations(applicationId))
        throw new ApplicationError(
          "This Application has saved Conversations and cannot be removed."
        )
      applications.delete(applicationId)
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
      existing(applicationId)
      if (!repositories.findById(repositoryId))
        throw new ApplicationError(
          "This Repository no longer exists. Choose another Repository."
        )
      applications.attachRepository(applicationId, repositoryId)
    },
    async detachRepository(
      headers: Headers,
      applicationId: string,
      repositoryId: string
    ) {
      await requireAdmin({ auth, headers })
      existing(applicationId)
      applications.detachRepository(applicationId, repositoryId)
    },
  }
}
