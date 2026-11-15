import type { Role } from "./roles"

/** A user as the Admin screens show it. Never carries a password. */
export type ManagedUser = {
  id: string
  name: string
  email: string
  role: Role
  /** A disabled user cannot log in. */
  disabled: boolean
}

export type UsersPage = {
  users: Array<ManagedUser>
  /** Users that match the search, over all pages. */
  total: number
  /** The page that was returned, starting at 1. */
  page: number
  pageSize: number
}

export const USERS_PAGE_SIZE = 20

/** Better Auth's defaults. */
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

/** The form fields an error can belong to. */
export type UserField =
  "name" | "email" | "role" | "password" | "currentPassword"

/** What a change to a user answers: the saved user, or what went wrong. */
export type UserResult =
  | { ok: true; user: ManagedUser }
  | { ok: false; message: string; field?: UserField }

export type PasswordResult =
  { ok: true } | { ok: false; message: string; field?: UserField }
