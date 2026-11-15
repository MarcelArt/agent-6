import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  ApplicationError,
  createApplicationManagement,
} from "./application-management"
import type {
  ApplicationProblem,
  ApplicationResult,
  AttachmentResult,
} from "@/lib/applications"

const id = z.object({ applicationId: z.string() })
const page = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
})
const input = z.object({
  name: z.string(),
  description: z.string(),
  notes: z.string(),
})
function refused(error: unknown): ApplicationProblem {
  if (!(error instanceof ApplicationError)) throw error
  return { ok: false, message: error.message, field: error.field }
}
export const listApplications = createServerFn({ method: "GET" })
  .validator(page)
  .handler(({ data }) =>
    createApplicationManagement().list(getRequestHeaders(), data)
  )
export const getApplication = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const found = await createApplicationManagement().get(
      getRequestHeaders(),
      data.applicationId
    )
    if (!found) throw notFound()
    return found
  })
/** Agent tools resolve scope here, using only the Conversation's Application id. */
export const getApplicationScope = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const scope = await createApplicationManagement().getApplicationScope(
      getRequestHeaders(),
      data.applicationId
    )
    if (!scope) throw notFound()
    return scope
  })
export const createApplication = createServerFn({ method: "POST" })
  .validator(input)
  .handler(async ({ data }): Promise<ApplicationResult> => {
    try {
      return {
        ok: true,
        application: await createApplicationManagement().create(
          getRequestHeaders(),
          data
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const updateApplication = createServerFn({ method: "POST" })
  .validator(input.extend(id.shape))
  .handler(
    async ({
      data: { applicationId, ...values },
    }): Promise<ApplicationResult> => {
      try {
        return {
          ok: true,
          application: await createApplicationManagement().update(
            getRequestHeaders(),
            applicationId,
            values
          ),
        }
      } catch (error) {
        return refused(error)
      }
    }
  )
export const deleteApplication = createServerFn({ method: "POST" })
  .validator(id)
  .handler(async ({ data }): Promise<AttachmentResult> => {
    try {
      await createApplicationManagement().remove(
        getRequestHeaders(),
        data.applicationId
      )
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })
export const listAvailableRepositories = createServerFn({ method: "GET" })
  .validator(page.extend(id.shape))
  .handler(({ data: { applicationId, ...options } }) =>
    createApplicationManagement().availableRepositories(
      getRequestHeaders(),
      applicationId,
      options
    )
  )
const attachment = id.extend({ repositoryId: z.string() })
export const attachRepository = createServerFn({ method: "POST" })
  .validator(attachment)
  .handler(async ({ data }): Promise<AttachmentResult> => {
    try {
      await createApplicationManagement().attachRepository(
        getRequestHeaders(),
        data.applicationId,
        data.repositoryId
      )
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })
export const detachRepository = createServerFn({ method: "POST" })
  .validator(attachment)
  .handler(async ({ data }): Promise<AttachmentResult> => {
    try {
      await createApplicationManagement().detachRepository(
        getRequestHeaders(),
        data.applicationId,
        data.repositoryId
      )
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })
