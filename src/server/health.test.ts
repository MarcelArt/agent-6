import { describe, expect, it } from "vitest"
import { healthResponse } from "./health"
import { openDb } from "./repositories/db"

describe("health", () => {
  it("checks a live database and refuses a closed database without details", async () => {
    const db = openDb(":memory:")
    const check = () => {
      db.$client.prepare("SELECT 1").get()
    }
    expect(healthResponse(check).status).toBe(200)
    db.$client.close()
    const response = healthResponse(check)
    expect(response.status).toBe(503)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.text()).toBe("")
  })
})
