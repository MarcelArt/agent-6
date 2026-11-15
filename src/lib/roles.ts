/** What a user may do. An Admin configures Agent 6; a Client only chats. */
export type Role = "admin" | "client"

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  client: "Client",
}

/** The logged-in user, as server and browser both see it. */
export type SessionUser = {
  id: string
  name: string
  email: string
  role: Role
}
