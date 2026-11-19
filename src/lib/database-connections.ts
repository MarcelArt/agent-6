export const SSL_MODES = ["disable", "require", "verify-full"] as const
export type SslMode = (typeof SSL_MODES)[number]
export type DatabaseConnectionInput = {
  name: string
  host: string
  port: number
  database: string
  user: string
  /** Empty on edit keeps the saved password. Never returned to a reader. */
  password: string
  sslMode: SslMode
  tags: Array<string>
  description: string
}
export type ConnectionTest = {
  ok: boolean
  message: string
  /** Null when privileges could not be checked. */
  writable: boolean | null
}
export type DatabaseConnection = Omit<DatabaseConnectionInput, "password"> & {
  id: string
  test: ConnectionTest
  /**
   * Imported from a Setup File without its password, which an Admin has not
   * entered yet. The agent cannot use it for any Application until then.
   */
  needsSecret: boolean
}
/** All the connection context the model receives. */
export type DatabaseConnectionContext = Pick<
  DatabaseConnection,
  "id" | "name" | "tags" | "description"
>
/** The stored test result of a Needs Secret connection. Nothing was tried. */
export const NEEDS_PASSWORD_TEST: ConnectionTest = {
  ok: false,
  writable: null,
  message:
    "Enter the password, then save. Agent 6 has not tried to connect without it.",
}
export type DatabaseConnectionProblem = {
  ok: false
  message: string
  field?: keyof DatabaseConnectionInput
}
export type DatabaseConnectionResult =
  { ok: true; connection: DatabaseConnection } | DatabaseConnectionProblem
