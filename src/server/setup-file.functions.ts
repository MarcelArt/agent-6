import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  SetupFileError,
  createSetupFileManagement,
} from "./setup-file-management"
import type {
  SetupFileExportResult,
  SetupFileImportResult,
  SetupFilePreviewResult,
} from "@/lib/setup-file"
import { MAX_SETUP_FILE_BYTES } from "@/lib/setup-file"

/*
 * Server functions behind the Export and Import dialogs. Each one requires
 * an Admin in `setup-file-management.ts`; the browser only picks and saves
 * files.
 */

/** The file's text. Its byte size is checked again when it is parsed. */
const file = z.object({ text: z.string().max(MAX_SETUP_FILE_BYTES) })

function refused(error: unknown) {
  if (!(error instanceof SetupFileError)) throw error
  return {
    ok: false as const,
    message: error.message,
    problems: error.problems,
  }
}

export const getSetupFileExportOptions = createServerFn({
  method: "GET",
}).handler(() => createSetupFileManagement().exportOptions(getRequestHeaders()))

export const exportSetupFile = createServerFn({ method: "POST" })
  .validator(
    z.object({ applicationIds: z.array(z.string()).min(1).max(10_000) })
  )
  .handler(async ({ data }): Promise<SetupFileExportResult> => {
    try {
      return await createSetupFileManagement().export(
        getRequestHeaders(),
        data.applicationIds
      )
    } catch (error) {
      return refused(error)
    }
  })

export const previewSetupFile = createServerFn({ method: "POST" })
  .validator(file)
  .handler(async ({ data }): Promise<SetupFilePreviewResult> => {
    try {
      return {
        ok: true,
        preview: await createSetupFileManagement().preview(
          getRequestHeaders(),
          data.text
        ),
      }
    } catch (error) {
      const { ok, message } = refused(error)
      return { ok, message }
    }
  })

export const importSetupFile = createServerFn({ method: "POST" })
  .validator(file)
  .handler(async ({ data }): Promise<SetupFileImportResult> => {
    try {
      return await createSetupFileManagement().import(
        getRequestHeaders(),
        data.text
      )
    } catch (error) {
      const { ok, message } = refused(error)
      return { ok, message }
    }
  })
