import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { createNavCounts } from "./nav-counts"

/** Counts for the Admin nav badges; null for anyone but an Admin. */
export const getNavCounts = createServerFn({ method: "GET" }).handler(() =>
  createNavCounts().counts(getRequestHeaders())
)
