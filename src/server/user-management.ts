import "@tanstack/react-start/server-only"

import { APIError } from "better-auth/api"
import { z } from "zod"
import { getAuth } from "./auth"
import { createUsersRepository } from "./repositories/users"
import { requireAdmin, requireSession } from "./session"
import type { Auth } from "./auth"
import type { UsersRepository } from "./repositories/users"
import type { Role } from "@/lib/roles"
import type { ManagedUser, UserField, UsersPage } from "@/lib/users"
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  USERS_PAGE_SIZE,
} from "@/lib/users"

/*
 * What an Admin may do to users, and what anyone may do to their own
 * account. Changes go through Better Auth's admin plugin; reads go through
 * the users repository.
 */

/** A change that was refused, in words for the person who asked for it. */
export class UserManagementError extends Error {
  constructor(
    message: string,
    /** The form field the problem belongs to, if any. */
    public readonly field?: UserField
  ) {
    super(message)
    this.name = "UserManagementError"
  }
}

export type UserInput = {
  name: string
  email: string
  role: Role
  /** On edit: empty or missing keeps the current password. */
  password?: string
}

const MAX_NAME_LENGTH = 100

/**
 * The two safety rules. Returns why taking the Admin role away from `target`,
 * or disabling them, is refused; null when it is fine.
 *
 * 1. The last active Admin cannot be disabled or demoted.
 * 2. An Admin cannot disable or demote themselves.
 */
export function safetyProblem(change: {
  actorId: string
  target: ManagedUser
  next: { role: Role; disabled: boolean }
  /** Admins who can log in right now, `target` included if they are one. */
  activeAdmins: number
}): UserManagementError | null {
  const { actorId, target, next } = change
  const isActiveAdmin = target.role === "admin" && !target.disabled
  const staysActiveAdmin = next.role === "admin" && !next.disabled
  if (!isActiveAdmin || staysActiveAdmin) return null

  const field = next.role !== "admin" ? "role" : undefined
  if (change.activeAdmins <= 1) {
    return new UserManagementError(
      `${target.name} is the only active Admin, so this would lock everyone out of the Admin screens. Make another user an Admin first.`,
      field
    )
  }
  if (target.id === actorId) {
    return new UserManagementError(
      next.disabled
        ? "You cannot disable your own account. Ask another Admin to do it."
        : "You cannot take the Admin role away from yourself. Ask another Admin to do it.",
      field
    )
  }
  return null
}

function validPassword(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserManagementError(
      `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      "password"
    )
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new UserManagementError(
      `The password can have at most ${MAX_PASSWORD_LENGTH} characters.`,
      "password"
    )
  }
  return password
}

/** Checks and tidies the form values that create and edit share. */
function validInput(input: UserInput): UserInput {
  const name = input.name.trim()
  if (!name) throw new UserManagementError("Enter a name.", "name")
  if (name.length > MAX_NAME_LENGTH) {
    throw new UserManagementError(
      `The name can have at most ${MAX_NAME_LENGTH} characters.`,
      "name"
    )
  }
  const email = input.email.trim().toLowerCase()
  if (!z.email().safeParse(email).success) {
    throw new UserManagementError(
      "Enter an email address, for example rina@example.com.",
      "email"
    )
  }
  return { name, email, role: input.role, password: input.password }
}

/** Better Auth's own refusals, in case one gets past the checks here. */
function fromAuthError(error: unknown): unknown {
  if (!(error instanceof APIError)) return error
  if (error.status === "UNAUTHORIZED" || error.status === "FORBIDDEN") {
    return error
  }
  return new UserManagementError(
    `Agent 6 could not save this: ${error.message}`
  )
}

/*
 * Changes run one at a time in this process. Otherwise two Admins demoting
 * each other at the same moment would both pass the last-Admin check.
 */
let queue: Promise<unknown> = Promise.resolve()

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work)
  queue = result.catch(() => undefined)
  return result
}

export function createUserManagement(
  deps: { auth?: Auth; users?: UsersRepository } = {}
) {
  const auth = deps.auth ?? getAuth()
  const users = deps.users ?? createUsersRepository()

  function existing(userId: string): ManagedUser {
    const user = users.findById(userId)
    if (!user) {
      throw new UserManagementError(
        "This user no longer exists. Go back to the list of users."
      )
    }
    return user
  }

  function refuseTakenEmail(email: string, exceptId?: string) {
    if (users.emailTaken(email, exceptId)) {
      throw new UserManagementError(
        `Another user already has the email ${email}. Use a different email.`,
        "email"
      )
    }
  }

  return {
    /** One page of users whose name or email contains `search`. */
    async list(
      headers: Headers,
      options: { search?: string; page?: number } = {}
    ): Promise<UsersPage> {
      await requireAdmin({ auth, headers })
      const pageSize = USERS_PAGE_SIZE
      const total = users.count(options.search)
      const lastPage = Math.max(1, Math.ceil(total / pageSize))
      const page = Math.min(Math.max(1, options.page ?? 1), lastPage)
      return {
        users: users.list({
          search: options.search,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        total,
        page,
        pageSize,
      }
    },

    async get(headers: Headers, userId: string): Promise<ManagedUser | null> {
      await requireAdmin({ auth, headers })
      return users.findById(userId) ?? null
    },

    async create(headers: Headers, input: UserInput): Promise<ManagedUser> {
      await requireAdmin({ auth, headers })
      const { name, email, role, password } = validInput(input)
      if (!password) {
        throw new UserManagementError("Enter a password.", "password")
      }
      validPassword(password)
      return oneAtATime(async () => {
        refuseTakenEmail(email)
        try {
          const created = await auth.api.createUser({
            headers,
            body: { name, email, role, password },
          })
          return existing(created.user.id)
        } catch (error) {
          throw fromAuthError(error)
        }
      })
    },

    /** Saves name, email and role, and the password when one is given. */
    async update(
      headers: Headers,
      userId: string,
      input: UserInput
    ): Promise<ManagedUser> {
      const actor = await requireAdmin({ auth, headers })
      const { name, email, role, password } = validInput(input)
      if (password) validPassword(password)
      return oneAtATime(async () => {
        const target = existing(userId)
        refuseTakenEmail(email, userId)
        const problem = safetyProblem({
          actorId: actor.id,
          target,
          next: { role, disabled: target.disabled },
          activeAdmins: users.countActiveAdmins(),
        })
        if (problem) throw problem
        try {
          await auth.api.adminUpdateUser({
            headers,
            body: { userId, data: { name, email, role } },
          })
          if (password) {
            await auth.api.setUserPassword({
              headers,
              body: { userId, newPassword: password },
            })
          }
        } catch (error) {
          throw fromAuthError(error)
        }
        return existing(userId)
      })
    },

    /**
     * Disables or re-enables a user. Disabling also ends their open
     * sessions.
     */
    async setDisabled(
      headers: Headers,
      userId: string,
      disabled: boolean
    ): Promise<ManagedUser> {
      const actor = await requireAdmin({ auth, headers })
      return oneAtATime(async () => {
        const target = existing(userId)
        if (target.disabled === disabled) return target
        const problem = safetyProblem({
          actorId: actor.id,
          target,
          next: { role: target.role, disabled },
          activeAdmins: users.countActiveAdmins(),
        })
        if (problem) throw problem
        try {
          if (disabled) {
            await auth.api.banUser({
              headers,
              body: { userId, banReason: "Disabled by an Admin" },
            })
          } else {
            await auth.api.unbanUser({ headers, body: { userId } })
          }
        } catch (error) {
          throw fromAuthError(error)
        }
        return existing(userId)
      })
    },

    /**
     * Changes the password of the logged-in user, who must know the current
     * one. Their sessions on other devices end.
     */
    async changeOwnPassword(
      headers: Headers,
      input: { currentPassword: string; newPassword: string }
    ): Promise<void> {
      await requireSession({ auth, headers })
      if (!input.currentPassword) {
        throw new UserManagementError(
          "Enter your current password.",
          "currentPassword"
        )
      }
      validPassword(input.newPassword)
      try {
        await auth.api.changePassword({
          headers,
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
            revokeOtherSessions: true,
          },
        })
      } catch (error) {
        if (
          error instanceof APIError &&
          error.body?.code === "INVALID_PASSWORD"
        ) {
          throw new UserManagementError(
            "The current password is not correct.",
            "currentPassword"
          )
        }
        throw fromAuthError(error)
      }
    },
  }
}

export type UserManagement = ReturnType<typeof createUserManagement>
