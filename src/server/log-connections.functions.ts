import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  LogConnectionError,
  createLogConnectionManagement,
} from "./log-connection-management"
import { LOG_AUTH_TYPES } from "@/lib/log-connections"
import type {
  LogConnectionProblem,
  LogConnectionResult,
  LogStreamCountResult,
} from "@/lib/log-connections"

const id = z.object({ logConnectionId: z.string() })
const page = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
})
const input = z.object({
  name: z.string(),
  baseUrl: z.string(),
  authType: z.enum(LOG_AUTH_TYPES),
  authUsername: z.string(),
  authSecret: z.string(),
  tenantId: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
})
function refused(error: unknown): LogConnectionProblem {
  if (!(error instanceof LogConnectionError)) throw error
  return { ok: false, message: error.message, field: error.field }
}
export const listLogConnections = createServerFn({ method: "GET" })
  .validator(page)
  .handler(({ data }) =>
    createLogConnectionManagement().list(getRequestHeaders(), data)
  )
export const getLogConnection = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const found = await createLogConnectionManagement().get(
      getRequestHeaders(),
      data.logConnectionId
    )
    if (!found) throw notFound()
    return found
  })
export const saveLogConnection = createServerFn({ method: "POST" })
  .validator(input.extend({ logConnectionId: z.string().optional() }))
  .handler(async ({ data }): Promise<LogConnectionResult> => {
    try {
      return {
        ok: true,
        connection: await createLogConnectionManagement().save(
          getRequestHeaders(),
          data,
          data.logConnectionId
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const testLogConnection = createServerFn({ method: "POST" })
  .validator(id)
  .handler(async ({ data }) => {
    try {
      return {
        ok: true as const,
        test: await createLogConnectionManagement().test(
          getRequestHeaders(),
          data.logConnectionId
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const deleteLogConnection = createServerFn({ method: "POST" })
  .validator(id)
  .handler(async ({ data }) => {
    try {
      await createLogConnectionManagement().remove(
        getRequestHeaders(),
        data.logConnectionId
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
export const listAvailableLogConnections = createServerFn({ method: "GET" })
  .validator(page.extend({ applicationId: z.string() }))
  .handler(({ data }) =>
    createLogConnectionManagement().available(
      getRequestHeaders(),
      data.applicationId,
      data
    )
  )
const selector = id.extend({ baseSelector: z.string().max(4000) })
export const countLogStreams = createServerFn({ method: "POST" })
  .validator(selector)
  .handler(async ({ data }): Promise<LogStreamCountResult> => {
    try {
      return {
        ok: true,
        streams: await createLogConnectionManagement().countStreams(
          getRequestHeaders(),
          data.logConnectionId,
          data.baseSelector
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const attachLogConnection = createServerFn({ method: "POST" })
  .validator(selector.extend({ applicationId: z.string() }))
  .handler(async ({ data }) => {
    try {
      await createLogConnectionManagement().attach(
        getRequestHeaders(),
        data.applicationId,
        data.logConnectionId,
        data.baseSelector
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
export const detachLogConnection = createServerFn({ method: "POST" })
  .validator(id.extend({ applicationId: z.string() }))
  .handler(async ({ data }) => {
    try {
      await createLogConnectionManagement().detach(
        getRequestHeaders(),
        data.applicationId,
        data.logConnectionId
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
