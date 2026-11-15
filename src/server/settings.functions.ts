import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { createSettingsManagement } from "./settings-management"

export const getSettings = createServerFn({ method: "GET" }).handler(() =>
  createSettingsManagement().get(getRequestHeaders())
)

export const savePreferredLanguage = createServerFn({ method: "POST" })
  .validator(z.object({ preferredLanguage: z.string() }))
  .handler(({ data }) =>
    createSettingsManagement().save(getRequestHeaders(), data.preferredLanguage)
  )
