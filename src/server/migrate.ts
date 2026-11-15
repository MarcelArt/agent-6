// `npm run db:migrate`: applies pending migrations to DATA_DIR/agent6.db.
import { startup } from "./startup"

startup()
console.log("Database is up to date.")
