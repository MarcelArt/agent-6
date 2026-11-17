import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { createDecisionSettingsManagement } from "./decision-settings"

export const getDecisionSettings = createServerFn({ method: "GET" }).handler(
  () => createDecisionSettingsManagement().get(getRequestHeaders())
)
export const saveDecisionSettings = createServerFn({ method: "POST" })
  .validator(z.object({ enabled: z.boolean() }))
  .handler(({ data }) =>
    createDecisionSettingsManagement().save(getRequestHeaders(), data.enabled)
  )
export const testDecisionConnection = createServerFn({
  method: "POST",
}).handler(() => createDecisionSettingsManagement().test(getRequestHeaders()))
