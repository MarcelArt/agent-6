import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CircleCheckIcon } from "lucide-react"
import {
  DetailHeader,
  FormActions,
  FormError,
  RecordForm,
} from "@/components/records/record-detail"
import { DetailPane } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { COMMON_LANGUAGES, MAX_LANGUAGE_LENGTH } from "@/lib/preferred-language"
import type { LanguageResult } from "@/lib/preferred-language"
import { getSettings, savePreferredLanguage } from "@/server/settings.functions"
import { getOAuthSettings } from "@/server/oauth.functions"
import { OAuthForm } from "@/components/settings/oauth-form"
import { DecisionForm } from "@/components/settings/decision-form"
import { getDecisionSettings } from "@/server/decision-settings.functions"

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings · Agent 6" }] }),
  loader: async () => {
    const [language, oauth, decision] = await Promise.all([
      getSettings(),
      getOAuthSettings(),
      getDecisionSettings(),
    ])
    return { ...language, oauth, decision }
  },
  component: Page,
})

function Page() {
  const saved = Route.useLoaderData()
  return (
    <DetailPane>
      <DetailHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LanguageForm />
        <DecisionForm saved={saved.decision} />
        <OAuthForm saved={saved.oauth} />
      </div>
    </DetailPane>
  )
}

function LanguageForm() {
  const saved = Route.useLoaderData()
  const router = useRouter()
  const common = (value: string) =>
    COMMON_LANGUAGES.some((item) => item === value)
  const [language, setLanguage] = useState(
    common(saved.preferredLanguage) ? saved.preferredLanguage : "other"
  )
  const [custom, setCustom] = useState(
    common(saved.preferredLanguage) ? "" : saved.preferredLanguage
  )
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<LanguageResult>()
  const invalid = result?.ok === false && !!result.field
  const reset = () => {
    setLanguage(
      common(saved.preferredLanguage) ? saved.preferredLanguage : "other"
    )
    setCustom(common(saved.preferredLanguage) ? "" : saved.preferredLanguage)
    setResult(undefined)
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setResult(undefined)
    try {
      const answer = await savePreferredLanguage({
        data: { preferredLanguage: language === "other" ? custom : language },
      })
      setResult(answer)
      if (answer.ok) await router.invalidate()
    } catch {
      setResult({
        ok: false,
        message:
          "Agent 6 could not be reached. Check your connection and reload Settings before trying again.",
      })
    } finally {
      setPending(false)
    }
  }
  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {result?.ok && (
        <Alert role="status">
          <CircleCheckIcon />
          <AlertTitle>Settings saved</AlertTitle>
          <AlertDescription>
            The Preferred Language applies to the next message in every
            Conversation.
          </AlertDescription>
        </Alert>
      )}
      {result?.ok === false && !result.field && (
        <FormError title="Settings not saved">{result.message}</FormError>
      )}
      <FieldSet disabled={pending}>
        <FieldLegend>Agent responses</FieldLegend>
        <FieldDescription>
          Choose the language Agent 6 uses for everyone, even when someone
          writes in another language. GitHub issues follow the Repository’s
          language.
        </FieldDescription>
        <FieldGroup>
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor="preferred-language">
              Preferred Language
            </FieldLabel>
            <Select
              value={language}
              disabled={pending}
              onValueChange={(value) => {
                if (value) setLanguage(value)
                setResult(undefined)
              }}
            >
              <SelectTrigger
                id="preferred-language"
                aria-invalid={invalid || undefined}
                aria-describedby="preferred-language-hint"
              >
                <SelectValue>
                  {language === "other" ? "Other language" : language}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {COMMON_LANGUAGES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other language</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription id="preferred-language-hint">
              Replies, Interactive Questions and agent messages use this
              language.
            </FieldDescription>
            {language !== "other" && invalid && (
              <FieldError>{result.message}</FieldError>
            )}
          </Field>
          {language === "other" && (
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="custom-language">Language name</FieldLabel>
              <Input
                id="custom-language"
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value)
                  setResult(undefined)
                }}
                required
                maxLength={MAX_LANGUAGE_LENGTH}
                placeholder="For example, Javanese"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "custom-language-error" : undefined}
              />
              {invalid && (
                <FieldError id="custom-language-error">
                  {result.message}
                </FieldError>
              )}
            </Field>
          )}
        </FieldGroup>
      </FieldSet>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}Save changes
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={reset}
        >
          Cancel
        </Button>
      </FormActions>
    </RecordForm>
  )
}
