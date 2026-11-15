import "@tanstack/react-start/server-only"

import { eq } from "drizzle-orm"
import { getDb } from "./db"
import { settings } from "./schema"
import type { Db } from "./db"

/** Organization-wide settings as key and value text. */
export function createSettingsRepository(db: Db = getDb()) {
  return {
    get(key: string): string | undefined {
      return db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .get()?.value
    },

    set(key: string, value: string): void {
      db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run()
    },

    delete(key: string): void {
      db.delete(settings).where(eq(settings.key, key)).run()
    },

    all(): Record<string, string> {
      return Object.fromEntries(
        db
          .select()
          .from(settings)
          .all()
          .map((row) => [row.key, row.value])
      )
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
