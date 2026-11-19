import { useState } from "react"
import { BoxesIcon } from "lucide-react"
import { FormError } from "@/components/records/record-detail"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { describeCounts, leftOutResources } from "@/lib/setup-file"
import type { SetupFileExportOptions } from "@/lib/setup-file"
import { exportSetupFile } from "@/server/setup-file.functions"

/** Hands the server-built file to the browser as a download. */
function save(fileName: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const attachedText = (
  application: SetupFileExportOptions["applications"][number]
) =>
  describeCounts({
    repositories: application.repositoryIds.length,
    databaseConnections: application.databaseConnectionIds.length,
    logConnections: application.logConnectionIds.length,
  }) || "Nothing attached"

/** Opened by `?dialog=export` on the Applications list. */
export function ExportDialog({
  options,
  onClose,
}: {
  options: SetupFileExportOptions
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<{
    message: string
    problems: Array<string>
  }>()
  const all = options.applications
  const everyChosen = all.length > 0 && chosen.size === all.length
  const leftOut = describeCounts(leftOutResources(options, chosen))

  function toggle(id: string, on: boolean) {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    setChosen(next)
    setProblem(undefined)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(undefined)
    try {
      const result = await exportSetupFile({
        data: { applicationIds: [...chosen] },
      })
      if (!result.ok) {
        setProblem(result)
        return
      }
      save(result.fileName, `${JSON.stringify(result.file, null, 2)}\n`)
      onClose()
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so nothing was exported. Check your connection, then try again.",
        problems: [],
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <form
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>Export Setup File</DialogTitle>
            <DialogDescription>
              Choose Applications to save with the Repositories, Database
              Connections and Log Connections attached to them. The file never
              holds a password or token.
            </DialogDescription>
          </DialogHeader>
          {problem && (
            <FormError title="Nothing was exported">
              {problem.message}
              {problem.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {problem.problems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </FormError>
          )}
          {all.length ? (
            <>
              <Field orientation="horizontal" className="border-b pb-3">
                <Checkbox
                  id="export-all"
                  checked={everyChosen}
                  onCheckedChange={(checked) => {
                    setChosen(
                      new Set(checked ? all.map((item) => item.id) : [])
                    )
                    setProblem(undefined)
                  }}
                />
                <FieldLabel htmlFor="export-all">Select all</FieldLabel>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {chosen.size} of {all.length} chosen
                </span>
              </Field>
              <ul
                aria-label="Applications"
                className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1 py-0.5"
              >
                {all.map((application) => (
                  <li key={application.id}>
                    <Field orientation="horizontal">
                      <Checkbox
                        id={`export-${application.id}`}
                        checked={chosen.has(application.id)}
                        onCheckedChange={(checked) =>
                          toggle(application.id, checked)
                        }
                        aria-describedby={`export-${application.id}-attached`}
                      />
                      <FieldContent className="min-w-0">
                        <FieldLabel
                          htmlFor={`export-${application.id}`}
                          className="max-w-full"
                        >
                          <span className="truncate">{application.name}</span>
                        </FieldLabel>
                        <FieldDescription
                          id={`export-${application.id}-attached`}
                        >
                          {attachedText(application)}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </li>
                ))}
              </ul>
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {chosen.size === 0
                  ? "Choose at least one Application."
                  : leftOut
                    ? `Left out: ${leftOut}, not attached to a chosen Application.`
                    : "Every Repository and connection is attached to a chosen Application, so all are included."}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              <BoxesIcon className="size-3.5 shrink-0" />
              There are no Applications to export yet.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || chosen.size === 0}>
              {pending ? "Exporting…" : "Export"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
