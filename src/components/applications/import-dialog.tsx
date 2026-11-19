import { useId, useRef, useState } from "react"
import {
  BoxesIcon,
  CircleAlertIcon,
  DatabaseIcon,
  FileJsonIcon,
  FolderGit2Icon,
  KeyRoundIcon,
  ScrollTextIcon,
} from "lucide-react"
import { FormError } from "@/components/records/record-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { MAX_SETUP_FILE_BYTES, parseSetupFile } from "@/lib/setup-file"
import type {
  SetupFileImportSummary,
  SetupFilePreview,
  SetupFilePreviewApplication,
  SetupFilePreviewAttachment,
  SetupFilePreviewRecord,
} from "@/lib/setup-file"
import {
  importSetupFile,
  previewSetupFile,
} from "@/server/setup-file.functions"

const UNREACHABLE =
  "Agent 6 could not be reached, so nothing was imported. Check your connection, then try again."

const icons = {
  repository: FolderGit2Icon,
  "database-connection": DatabaseIcon,
  "log-connection": ScrollTextIcon,
  application: BoxesIcon,
}

/**
 * Opened by `?dialog=import` on the Applications list. The uploaded file
 * lives only in this dialog: a reload shows the upload step again.
 */
export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (summary: SetupFileImportSummary) => Promise<void>
}) {
  const [loaded, setLoaded] = useState<{
    name: string
    text: string
    preview: SetupFilePreview
  }>()
  const [problem, setProblem] = useState<string>()
  const [pending, setPending] = useState(false)

  async function choose(file: File | undefined) {
    setProblem(undefined)
    if (!file) return
    if (file.size > MAX_SETUP_FILE_BYTES) {
      setProblem(
        "This file is larger than 1 MB, so it is not a Setup File Agent 6 can import. Upload the file that Export saved."
      )
      return
    }
    setPending(true)
    try {
      const text = await file.text()
      // The server reads it again; this answers a wrong file at once.
      const parsed = parseSetupFile(text)
      if (!parsed.ok) {
        setProblem(parsed.message)
        return
      }
      const result = await previewSetupFile({ data: { text } })
      if (result.ok)
        setLoaded({ name: file.name, text, preview: result.preview })
      else setProblem(result.message)
    } catch {
      setProblem(
        "Agent 6 could not read this file. Check your connection, then try again."
      )
    } finally {
      setPending(false)
    }
  }

  async function confirm() {
    if (!loaded) return
    setPending(true)
    setProblem(undefined)
    try {
      const result = await importSetupFile({ data: { text: loaded.text } })
      if (result.ok) await onImported(result.summary)
      else if ("preview" in result)
        // Something changed since the preview; nothing was written.
        setLoaded({ ...loaded, preview: result.preview })
      else setProblem(result.message)
    } catch {
      setProblem(UNREACHABLE)
    } finally {
      setPending(false)
    }
  }

  const preview = loaded?.preview
  const blocked = !!preview?.problems.length
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Setup File</DialogTitle>
          <DialogDescription>
            {preview
              ? `Preview of ${loaded.name}. Nothing is written until you confirm.`
              : "Adds the Applications, Repositories and connections of a Setup File, and their Attachments. Existing records are reused unchanged; nothing is removed."}
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <>
            {problem && (
              <FormError title="Nothing was imported">{problem}</FormError>
            )}
            <div className="-mx-1 flex min-h-0 flex-col gap-5 overflow-y-auto px-1 py-0.5">
              <Problems preview={preview} />
              {!blocked && !preview.changes && (
                <Alert>
                  <CircleAlertIcon />
                  <AlertTitle>Nothing to import</AlertTitle>
                  <AlertDescription>
                    Everything in this file already exists here, with the same
                    Attachments. Importing it again would change nothing.
                  </AlertDescription>
                </Alert>
              )}
              <Section title="Applications" records={preview.applications} />
              <Section title="Repositories" records={preview.repositories} />
              <Section
                title="Database Connections"
                records={preview.databaseConnections}
              />
              <Section
                title="Log Connections"
                records={preview.logConnections}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setLoaded(undefined)
                  setProblem(undefined)
                }}
              >
                Choose another file
              </Button>
              <Button
                type="button"
                disabled={pending || blocked || !preview.changes}
                onClick={() => void confirm()}
              >
                {pending ? "Importing…" : "Confirm import"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <Upload
            pending={pending}
            problem={problem}
            onChoose={(file) => void choose(file)}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Upload({
  pending,
  problem,
  onChoose,
  onClose,
}: {
  pending: boolean
  problem?: string
  onChoose: (file: File | undefined) => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Field data-invalid={problem ? true : undefined}>
        <FieldLabel htmlFor="setup-file">Setup File</FieldLabel>
        <Input
          ref={input}
          id="setup-file"
          type="file"
          accept=".json,application/json"
          disabled={pending}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "setup-file-error" : "setup-file-hint"}
          onChange={(event) => {
            onChoose(event.target.files?.[0])
            // Choosing the same file again after fixing it reads it again.
            event.target.value = ""
          }}
        />
        {problem ? (
          <FieldError id="setup-file-error">{problem}</FieldError>
        ) : (
          <FieldDescription id="setup-file-hint">
            {pending
              ? "Checking the file…"
              : "The agent6-setup-….json file that Export saved, up to 1 MB. Agent 6 shows what it would do before anything is written."}
          </FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          <FileJsonIcon data-icon="inline-start" />
          {pending ? "Checking…" : "Choose file"}
        </Button>
      </DialogFooter>
    </>
  )
}

function Problems({ preview }: { preview: SetupFilePreview }) {
  if (!preview.problems.length) return null
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>
        {preview.problems.length === 1
          ? "1 problem blocks this import"
          : `${preview.problems.length} problems block this import`}
      </AlertTitle>
      <AlertDescription>
        <div>
          Nothing is written. Fix the instance or the file, then upload it
          again.
        </div>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
          {preview.problems.map((item, index) => (
            <li key={index}>
              <span className="font-medium">{item.record}:</span> {item.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function Section({
  title,
  records,
}: {
  title: string
  records: Array<SetupFilePreviewRecord | SetupFilePreviewApplication>
}) {
  const id = useId()
  if (!records.length) return null
  const created = records.filter((record) => record.status === "new").length
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="flex items-baseline gap-2 text-xs font-medium">
        {title}
        <span className="font-normal text-muted-foreground tabular-nums">
          {created} new, {records.length - created} existing
        </span>
      </h3>
      <ul className="divide-y rounded-md border">
        {records.map((record, index) => (
          <Record key={index} record={record} />
        ))}
      </ul>
    </section>
  )
}

function StatusBadge({ status }: { status: "new" | "existing" }) {
  return (
    <Badge
      variant={status === "new" ? "secondary" : "outline"}
      className="text-xs"
    >
      {status === "new" ? "New" : "Existing, reused"}
    </Badge>
  )
}

function Record({
  record,
}: {
  record: SetupFilePreviewRecord | SetupFilePreviewApplication
}) {
  const Icon = icons[record.kind]
  const attachments = "attachments" in record ? record.attachments : []
  const added = attachments.filter((item) => item.status === "new")
  return (
    <li className="flex min-w-0 flex-col gap-1.5 px-3 py-2 text-xs">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">{record.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {record.needsSecret && (
            <Badge variant="outline" className="text-xs">
              <KeyRoundIcon />
              Needs secret
            </Badge>
          )}
          <StatusBadge status={record.status} />
        </span>
      </div>
      <p className="break-words text-muted-foreground">
        {record.detail}
        {record.needsSecret &&
          ". Arrives without its secret; the agent cannot use it until you enter it"}
      </p>
      {record.differences.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            Kept as it is here, although the file differs:
          </p>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            {record.differences.map((item) => (
              <Difference key={item.label} {...item} />
            ))}
          </dl>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-col gap-1">
          {record.status === "existing" && added.length > 0 && (
            <p className="font-medium">
              Adds {added.length}{" "}
              {added.length === 1 ? "Attachment" : "Attachments"}, which widen
              what the agent can read for {record.name}.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {attachments.map((item, index) => (
              <AttachmentLine
                key={index}
                item={item}
                callOut={record.status === "existing"}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function Difference({
  label,
  file,
  existing,
}: {
  label: string
  file: string
  existing: string
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        here “{existing}”, file “{file}”
      </dd>
    </>
  )
}

function AttachmentLine({
  item,
  callOut,
}: {
  item: SetupFilePreviewAttachment
  /** On an existing Application, new Attachments widen its scope. */
  callOut: boolean
}) {
  const Icon = icons[item.kind]
  return (
    <li className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted/50 px-2 py-1">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{item.name}</span>
        <span
          className={
            item.status === "new" && callOut
              ? "ml-auto shrink-0 font-medium"
              : "ml-auto shrink-0 text-foreground/70"
          }
        >
          {item.status === "new" ? "New Attachment" : "Already attached"}
        </span>
      </span>
      {item.baseSelector !== undefined && (
        <span className="font-mono break-all text-foreground/70">
          {item.existingBaseSelector !== undefined ? (
            <>
              Keeps {item.existingBaseSelector}; the file has{" "}
              {item.baseSelector}
            </>
          ) : (
            item.baseSelector
          )}
        </span>
      )}
    </li>
  )
}
