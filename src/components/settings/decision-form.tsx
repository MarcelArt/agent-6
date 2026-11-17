import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { FormActions, FormError } from "@/components/records/record-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  saveDecisionSettings,
  testDecisionConnection,
} from "@/server/decision-settings.functions"
import type {
  DecisionSettings,
  DecisionSettingsResult,
} from "@/lib/decision-ai"

export function DecisionForm({ saved }: { saved: DecisionSettings }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(saved.enabled)
  const [pending, setPending] = useState<"save" | "test">()
  const [result, setResult] = useState<DecisionSettingsResult>()
  const available = saved.status === "configured"
  async function run(action: "save" | "test") {
    setPending(action)
    setResult(undefined)
    try {
      const answer =
        action === "save"
          ? await saveDecisionSettings({ data: { enabled } })
          : await testDecisionConnection()
      setResult(answer)
      if (answer.ok && action === "save") await router.invalidate()
    } catch {
      setResult({
        ok: false,
        message: "Agent 6 could not be reached. Reload Settings and try again.",
      })
    } finally {
      setPending(undefined)
    }
  }
  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault()
        void run("save")
      }}
      className="mx-auto flex w-full max-w-xl flex-col gap-6 border-t px-4 py-6 md:px-8 md:py-10"
    >
      {result?.ok && (
        <Alert role="status">
          <AlertTitle>Decision AI</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      {result?.ok === false && (
        <FormError title="Decision AI">{result.message}</FormError>
      )}
      <FieldSet disabled={!!pending}>
        <FieldLegend>Decision AI</FieldLegend>
        <FieldDescription>
          Help Agent 6 choose where to investigate and how to classify and
          report faults. If Decision AI is unavailable, the regular agent
          continues.
        </FieldDescription>
        <div className="text-xs" role="status">
          {available ? (
            <>
              <span className="font-medium">Configured</span>
              <p className="mt-1 break-all text-muted-foreground">
                {saved.provider} · {saved.model}
              </p>
            </>
          ) : (
            <span className="font-medium">
              {saved.status === "invalid"
                ? "Configuration error"
                : "Not configured"}
            </span>
          )}
          {saved.problems.map((problem) => (
            <p key={problem} className="mt-1 text-destructive">
              {problem}
            </p>
          ))}
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id="decision-ai-enabled"
            checked={available && enabled}
            disabled={!available || !!pending}
            onCheckedChange={(checked) => {
              setEnabled(checked)
              setResult(undefined)
            }}
          />
          <FieldLabel htmlFor="decision-ai-enabled">
            Enable Decision AI
          </FieldLabel>
        </Field>
        <FieldDescription>
          {available
            ? "Applies to the next reply in every Conversation. Testing the connection does not enable the feature."
            : "Ask your system administrator to configure the provider in the server environment, then restart Agent 6."}
        </FieldDescription>
      </FieldSet>
      <FormActions>
        <Button type="submit" disabled={!available || !!pending}>
          {pending === "save" && <Spinner />}Save Decision AI
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!available || !!pending}
          onClick={() => void run("test")}
        >
          {pending === "test" && <Spinner />}Test connection
        </Button>
      </FormActions>
    </form>
  )
}
