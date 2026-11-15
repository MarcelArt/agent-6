import { sqliteTable, text } from "drizzle-orm/sqlite-core"

/*
 * Column rules (ADR 0001): only text, integer, real, boolean stored as
 * integer and timestamps stored as integer. JSON is stored as text.
 */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})
