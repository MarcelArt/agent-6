import { defineConfig } from "drizzle-kit"

// Only used to generate migrations from the schema (`npm run db:generate`).
// Migrations are applied by the app itself; see src/server/repositories/db.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/repositories/schema.ts",
  out: "./drizzle",
})
