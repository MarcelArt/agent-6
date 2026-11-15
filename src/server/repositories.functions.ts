import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  RepositoryError,
  createRepositoryManagement,
} from "./repository-management"
import type {
  RemoveResult,
  RepositoryCheck,
  RepositoryProblem,
  RepositoryResult,
} from "@/lib/repositories"

/*
 * Server functions behind the Repositories screens. Who may call them is
 * checked in `repository-management.ts`.
 */

const repositoryInput = z.object({
  trackedBranch: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
})

/** A refused change becomes an answer the form can show. */
function refused(error: unknown): RepositoryProblem {
  if (!(error instanceof RepositoryError)) throw error
  return { ok: false, message: error.message, field: error.field }
}

export const listRepositories = createServerFn({ method: "GET" })
  .validator(
    z.object({ search: z.string().optional(), page: z.number().optional() })
  )
  .handler(({ data }) =>
    createRepositoryManagement().list(getRequestHeaders(), data)
  )

export const getRepository = createServerFn({ method: "GET" })
  .validator(z.object({ repositoryId: z.string() }))
  .handler(async ({ data }) => {
    const detail = await createRepositoryManagement().get(
      getRequestHeaders(),
      data.repositoryId
    )
    if (!detail) throw notFound()
    return detail
  })

export const getRepositorySyncStates = createServerFn({ method: "GET" })
  .validator(z.object({ repositoryIds: z.array(z.string()).max(100) }))
  .handler(({ data }) =>
    createRepositoryManagement().syncStates(
      getRequestHeaders(),
      data.repositoryIds
    )
  )

export const checkRepository = createServerFn({ method: "POST" })
  .validator(z.object({ reference: z.string() }))
  .handler(async ({ data }): Promise<RepositoryCheck> => {
    try {
      const found = await createRepositoryManagement().check(
        getRequestHeaders(),
        data.reference
      )
      return { ok: true, ...found }
    } catch (error) {
      return refused(error)
    }
  })

export const listRepositoryBranches = createServerFn({ method: "GET" })
  .validator(z.object({ repositoryId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; branches: Array<string> } | RepositoryProblem> => {
      try {
        const branches = await createRepositoryManagement().branches(
          getRequestHeaders(),
          data.repositoryId
        )
        return { ok: true, branches }
      } catch (error) {
        return refused(error)
      }
    }
  )

export const connectRepository = createServerFn({ method: "POST" })
  .validator(repositoryInput.extend({ reference: z.string() }))
  .handler(async ({ data }): Promise<RepositoryResult> => {
    try {
      const repository = await createRepositoryManagement().connect(
        getRequestHeaders(),
        data
      )
      return { ok: true, repository }
    } catch (error) {
      return refused(error)
    }
  })

export const updateRepository = createServerFn({ method: "POST" })
  .validator(repositoryInput.extend({ repositoryId: z.string() }))
  .handler(
    async ({ data: { repositoryId, ...input } }): Promise<RepositoryResult> => {
      try {
        const repository = await createRepositoryManagement().update(
          getRequestHeaders(),
          repositoryId,
          input
        )
        return { ok: true, repository }
      } catch (error) {
        return refused(error)
      }
    }
  )

export const syncRepository = createServerFn({ method: "POST" })
  .validator(z.object({ repositoryId: z.string() }))
  .handler(async ({ data }): Promise<RepositoryResult> => {
    try {
      const repository = await createRepositoryManagement().syncNow(
        getRequestHeaders(),
        data.repositoryId
      )
      return { ok: true, repository }
    } catch (error) {
      return refused(error)
    }
  })

export const removeRepository = createServerFn({ method: "POST" })
  .validator(z.object({ repositoryId: z.string() }))
  .handler(async ({ data }): Promise<RemoveResult> => {
    try {
      await createRepositoryManagement().remove(
        getRequestHeaders(),
        data.repositoryId
      )
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })
