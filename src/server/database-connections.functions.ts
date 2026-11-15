import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  createDatabaseConnectionManagement,
  DatabaseConnectionError,
} from "./database-connection-management"
import { SSL_MODES } from "@/lib/database-connections"
import type {
  DatabaseConnectionProblem,
  DatabaseConnectionResult,
} from "@/lib/database-connections"

const id = z.object({ databaseConnectionId: z.string() })
const page = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
})
const input = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  sslMode: z.enum(SSL_MODES),
  tags: z.array(z.string()),
  description: z.string(),
})
function refused(error: unknown): DatabaseConnectionProblem {
  if (!(error instanceof DatabaseConnectionError)) throw error
  return { ok: false, message: error.message, field: error.field }
}
export const listDatabaseConnections = createServerFn({ method: "GET" })
  .validator(page)
  .handler(({ data }) =>
    createDatabaseConnectionManagement().list(getRequestHeaders(), data)
  )
export const getDatabaseConnection = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const found = await createDatabaseConnectionManagement().get(
      getRequestHeaders(),
      data.databaseConnectionId
    )
    if (!found) throw notFound()
    return found
  })
export const saveDatabaseConnection = createServerFn({ method: "POST" })
  .validator(input.extend({ databaseConnectionId: z.string().optional() }))
  .handler(async ({ data }): Promise<DatabaseConnectionResult> => {
    try {
      return {
        ok: true,
        connection: await createDatabaseConnectionManagement().save(
          getRequestHeaders(),
          data,
          data.databaseConnectionId
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const testDatabaseConnection = createServerFn({ method: "POST" })
  .validator(id)
  .handler(async ({ data }) => {
    try {
      return {
        ok: true as const,
        test: await createDatabaseConnectionManagement().test(
          getRequestHeaders(),
          data.databaseConnectionId
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })
export const deleteDatabaseConnection = createServerFn({ method: "POST" })
  .validator(id)
  .handler(async ({ data }) => {
    try {
      await createDatabaseConnectionManagement().remove(
        getRequestHeaders(),
        data.databaseConnectionId
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
const applicationPage = page.extend({ applicationId: z.string() })
export const listAvailableDatabaseConnections = createServerFn({
  method: "GET",
})
  .validator(applicationPage)
  .handler(({ data }) =>
    createDatabaseConnectionManagement().available(
      getRequestHeaders(),
      data.applicationId,
      data
    )
  )
const attachment = id.extend({ applicationId: z.string() })
export const attachDatabaseConnection = createServerFn({ method: "POST" })
  .validator(attachment)
  .handler(async ({ data }) => {
    try {
      await createDatabaseConnectionManagement().attach(
        getRequestHeaders(),
        data.applicationId,
        data.databaseConnectionId
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
export const detachDatabaseConnection = createServerFn({ method: "POST" })
  .validator(attachment)
  .handler(async ({ data }) => {
    try {
      await createDatabaseConnectionManagement().detach(
        getRequestHeaders(),
        data.applicationId,
        data.databaseConnectionId
      )
      return { ok: true as const }
    } catch (error) {
      return refused(error)
    }
  })
