import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { CircleCheckIcon } from "lucide-react"
import type { OAuthInput, OAuthResult, OAuthSettings } from "@/lib/oauth"
import { FormActions, FormError } from "@/components/records/record-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Spinner } from "@/components/ui/spinner"
import { saveOAuthSettings, testOAuthDiscovery } from "@/server/oauth.functions"

export function OAuthForm({ saved }: { saved: OAuthSettings }) {
  const router = useRouter()
  const initial = (): OAuthInput => ({
    enabled: saved.enabled,
    displayName: saved.displayName,
    discoveryUrl: saved.discoveryUrl,
    clientId: saved.clientId,
    clientSecret: "",
    scopes: saved.scopes,
  })
  const [values, setValues] = useState(initial)
  const [replace, setReplace] = useState(false)
  const [pending, setPending] = useState<"save" | "test">()
  const [result, setResult] = useState<OAuthResult>()
  const [notice, setNotice] = useState<string>()
  const change = <TKey extends keyof OAuthInput>(
    key: TKey,
    value: OAuthInput[TKey]
  ) => {
    setValues((old) => ({ ...old, [key]: value }))
    setResult(undefined)
    setNotice(undefined)
  }
  async function run(action: "save" | "test") {
    setPending(action)
    setResult(undefined)
    setNotice(undefined)
    try {
      const answer =
        action === "save"
          ? await saveOAuthSettings({ data: values })
          : await testOAuthDiscovery({
              data: { discoveryUrl: values.discoveryUrl },
            })
      setResult(answer)
      if (answer.ok) {
        setNotice(
          action === "save"
            ? "Provider settings saved. Changes apply immediately."
            : "Discovery document loaded. Save changes to apply these settings."
        )
        if (action === "save") {
          setValues((old) => ({ ...old, clientSecret: "" }))
          setReplace(false)
          await router.invalidate()
        }
      }
    } catch {
      setResult({
        ok: false,
        message: "Agent 6 could not be reached. Reload Settings and try again.",
      })
    } finally {
      setPending(undefined)
    }
  }
  const fieldError = (key: keyof OAuthInput) =>
    result?.ok === false && result.field === key
  const textField = (
    key: "displayName" | "discoveryUrl" | "clientId" | "scopes",
    label: string,
    help?: string
  ) => (
    <Field data-invalid={fieldError(key) || undefined}>
      <FieldLabel htmlFor={`oauth-${key}`}>{label}</FieldLabel>
      <Input
        id={`oauth-${key}`}
        value={values[key]}
        onChange={(event) => change(key, event.target.value)}
        required={values.enabled}
        maxLength={
          key === "displayName"
            ? 80
            : key === "clientId"
              ? 512
              : key === "scopes"
                ? 1024
                : 2048
        }
        autoComplete="off"
        aria-invalid={fieldError(key) || undefined}
        aria-describedby={
          [
            help ? `oauth-${key}-hint` : undefined,
            fieldError(key) ? `oauth-${key}-error` : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {help && (
        <FieldDescription id={`oauth-${key}-hint`}>{help}</FieldDescription>
      )}
      {fieldError(key) && result?.ok === false && (
        <FieldError id={`oauth-${key}-error`}>{result.message}</FieldError>
      )}
    </Field>
  )
  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault()
        void run("save")
      }}
      className="mx-auto flex w-full max-w-xl flex-col gap-6 border-t px-4 py-6 md:px-8 md:py-10"
    >
      {notice && (
        <Alert role="status">
          <CircleCheckIcon />
          <AlertTitle>{notice}</AlertTitle>
          <AlertDescription>Password sign-in stays available.</AlertDescription>
        </Alert>
      )}
      {result?.ok === false && !result.field && (
        <FormError title="Provider settings not saved">
          {result.message}
        </FormError>
      )}
      <FieldSet disabled={!!pending}>
        <FieldLegend>Organization sign-in</FieldLegend>
        <FieldDescription>
          Let people sign in through your organization’s OAuth or OpenID Connect
          provider. Only active users an Admin has already created can sign in.
          Password sign-in always stays available.
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="oauth-enabled"
              checked={values.enabled}
              onCheckedChange={(checked) => change("enabled", checked)}
            />
            <FieldLabel htmlFor="oauth-enabled">
              Enable provider sign-in
            </FieldLabel>
          </Field>
          {textField(
            "displayName",
            "Display name",
            "Shown on the sign-in button, for example Keycloak."
          )}
          {textField(
            "discoveryUrl",
            "Issuer or discovery URL",
            "Enter the issuer address or the full .well-known/openid-configuration URL."
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={!!pending || !values.discoveryUrl}
              onClick={() => void run("test")}
            >
              {pending === "test" && <Spinner />}Test discovery
            </Button>
          </div>
          {textField("clientId", "Client ID")}
          <Field data-invalid={fieldError("clientSecret") || undefined}>
            <FieldLabel htmlFor="oauth-clientSecret">Client secret</FieldLabel>
            {saved.hasClientSecret && !replace ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Saved</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReplace(true)}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Input
                id="oauth-clientSecret"
                type="password"
                value={values.clientSecret}
                onChange={(event) => change("clientSecret", event.target.value)}
                required={values.enabled && !saved.hasClientSecret}
                maxLength={8192}
                autoComplete="new-password"
                aria-invalid={fieldError("clientSecret") || undefined}
                aria-describedby="oauth-secret-hint"
              />
            )}
            <FieldDescription id="oauth-secret-hint">
              Encrypted when saved. Leave empty to keep the saved secret.
            </FieldDescription>
            {fieldError("clientSecret") && result?.ok === false && (
              <FieldError>{result.message}</FieldError>
            )}
          </Field>
          {textField(
            "scopes",
            "Scopes",
            "Separate scopes with spaces. Include openid, email and profile for OpenID Connect."
          )}
          <Field>
            <FieldLabel htmlFor="oauth-redirect">Redirect URL</FieldLabel>
            <Input id="oauth-redirect" value={saved.redirectUrl} readOnly />
            <FieldDescription>
              Register this exact redirect URL with your provider.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FormActions>
        <Button type="submit" disabled={!!pending}>
          {pending === "save" && <Spinner />}Save provider
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!!pending}
          onClick={() => {
            setValues(initial())
            setReplace(false)
            setResult(undefined)
            setNotice(undefined)
          }}
        >
          Cancel
        </Button>
      </FormActions>
    </form>
  )
}
