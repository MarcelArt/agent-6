import "@tanstack/react-start/server-only"

import { and, asc, count, eq, ne, or, sql } from "drizzle-orm"
import { getDb } from "./db"
import { user } from "./schema"
import type { Db } from "./db"
import type { ManagedUser } from "@/lib/users"

type Row = typeof user.$inferSelect

function toManagedUser(row: Row): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    // Anything that is not exactly "admin" gets the lesser role.
    role: row.role === "admin" ? "admin" : "client",
    disabled: row.banned === true,
  }
}

/** Matches users whose name or email contains the text, ignoring case. */
function matches(search: string | undefined) {
  const text = search?.trim().toLowerCase()
  if (!text) return undefined
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`
  return or(
    sql`lower(${user.name}) like ${pattern} escape '\\'`,
    sql`lower(${user.email}) like ${pattern} escape '\\'`
  )
}

/**
 * Users are created and changed through Better Auth (`../auth.ts`), not
 * here. This repository only reads.
 */
export function createUsersRepository(db: Db = getDb()) {
  return {
    count(search?: string): number {
      return (
        db.select({ value: count() }).from(user).where(matches(search)).get()
          ?.value ?? 0
      )
    },

    /** One page of users, by name. */
    list(options: {
      search?: string
      limit: number
      offset: number
    }): Array<ManagedUser> {
      return db
        .select()
        .from(user)
        .where(matches(options.search))
        .orderBy(asc(sql`lower(${user.name})`), asc(user.id))
        .limit(options.limit)
        .offset(options.offset)
        .all()
        .map(toManagedUser)
    },

    findById(id: string): ManagedUser | undefined {
      const row = db.select().from(user).where(eq(user.id, id)).get()
      return row && toManagedUser(row)
    },

    findByEmail(email: string): ManagedUser | undefined {
      const row = db
        .select()
        .from(user)
        .where(eq(user.email, email.toLowerCase()))
        .get()
      return row && toManagedUser(row)
    },

    /** Whether a user other than `exceptId` already has this email. */
    emailTaken(email: string, exceptId?: string): boolean {
      const row = db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.email, email.toLowerCase()),
            exceptId ? ne(user.id, exceptId) : undefined
          )
        )
        .get()
      return row !== undefined
    },

    /** Admins who can log in. */
    countActiveAdmins(): number {
      return (
        db
          .select({ value: count() })
          .from(user)
          .where(
            and(
              eq(user.role, "admin"),
              or(eq(user.banned, false), sql`${user.banned} is null`)
            )
          )
          .get()?.value ?? 0
      )
    },
  }
}

export type UsersRepository = ReturnType<typeof createUsersRepository>
