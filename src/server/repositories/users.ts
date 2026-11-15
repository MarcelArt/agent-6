import "@tanstack/react-start/server-only"

import { count } from "drizzle-orm"
import { getDb } from "./db"
import { user } from "./schema"
import type { Db } from "./db"

/**
 * Users are created and changed through Better Auth (`../auth.ts`), not
 * here. This repository only answers questions Better Auth has no call for.
 */
export function createUsersRepository(db: Db = getDb()) {
  return {
    count(): number {
      return db.select({ value: count() }).from(user).get()?.value ?? 0
    },
  }
}

export type UsersRepository = ReturnType<typeof createUsersRepository>
