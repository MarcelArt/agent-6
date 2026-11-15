import { createServerFn } from "@tanstack/react-start"
import { getSessionUser } from "./session"

/** The logged-in user, or null. Routes use it to decide what to show. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  getSessionUser()
)
