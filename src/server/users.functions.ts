import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { UserManagementError, createUserManagement } from "./user-management"
import type { PasswordResult, UserField, UserResult } from "@/lib/users"

/*
 * Server functions behind the Users screens and the account page. Who may
 * call them is checked in `user-management.ts`.
 */

const userInput = z.object({
  name: z.string(),
  email: z.string(),
  role: z.enum(["admin", "client"]),
  password: z.string().optional(),
})

/** A refused change becomes an answer the form can show. */
function refused(error: unknown): {
  ok: false
  message: string
  field?: UserField
} {
  if (!(error instanceof UserManagementError)) throw error
  return { ok: false, message: error.message, field: error.field }
}

export const listUsers = createServerFn({ method: "GET" })
  .validator(
    z.object({ search: z.string().optional(), page: z.number().optional() })
  )
  .handler(({ data }) => createUserManagement().list(getRequestHeaders(), data))

export const getUser = createServerFn({ method: "GET" })
  .validator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const user = await createUserManagement().get(
      getRequestHeaders(),
      data.userId
    )
    if (!user) throw notFound()
    return user
  })

export const createUser = createServerFn({ method: "POST" })
  .validator(userInput)
  .handler(async ({ data }): Promise<UserResult> => {
    try {
      const user = await createUserManagement().create(
        getRequestHeaders(),
        data
      )
      return { ok: true, user }
    } catch (error) {
      return refused(error)
    }
  })

export const updateUser = createServerFn({ method: "POST" })
  .validator(userInput.extend({ userId: z.string() }))
  .handler(async ({ data: { userId, ...input } }): Promise<UserResult> => {
    try {
      const user = await createUserManagement().update(
        getRequestHeaders(),
        userId,
        input
      )
      return { ok: true, user }
    } catch (error) {
      return refused(error)
    }
  })

export const setUserDisabled = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string(), disabled: z.boolean() }))
  .handler(async ({ data }): Promise<UserResult> => {
    try {
      const user = await createUserManagement().setDisabled(
        getRequestHeaders(),
        data.userId,
        data.disabled
      )
      return { ok: true, user }
    } catch (error) {
      return refused(error)
    }
  })

export const changeOwnPassword = createServerFn({ method: "POST" })
  .validator(z.object({ currentPassword: z.string(), newPassword: z.string() }))
  .handler(async ({ data }): Promise<PasswordResult> => {
    try {
      await createUserManagement().changeOwnPassword(getRequestHeaders(), data)
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })
