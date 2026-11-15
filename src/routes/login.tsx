import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { z } from "zod"
import type { ThemeMode } from "@/lib/theme"
import { ProductMark } from "@/components/shell/app-shell"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { authClient } from "@/lib/auth-client"
import { safeRedirect } from "@/lib/login-redirect"
import { useTheme } from "@/lib/theme"

export const Route = createFileRoute("/login")({
  // `redirect` is the address the person asked for before they were sent here.
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    // Already logged in: nothing to do here.
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) })
  },
  head: () => ({ meta: [{ title: "Sign in · Agent 6" }] }),
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(undefined)
    setPending(true)
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      })
      if (result.error) {
        setError(
          result.error.status === 401
            ? "The email or password is not correct."
            : "Agent 6 could not sign you in. Try again in a moment."
        )
        setPending(false)
        return
      }
    } catch {
      setError("Agent 6 could not be reached. Check your connection.")
      setPending(false)
      return
    }
    // Replace, so Back does not return to the login form.
    router.history.replace(safeRedirect(search.redirect))
  }

  return (
    <div className="relative flex min-h-svh flex-col md:flex-row">
      <div className="flex items-center border-b bg-sidebar px-4 py-3 md:w-1/2 md:flex-col md:items-start md:justify-between md:border-r md:border-b-0 md:p-10">
        <div className="flex items-center gap-2.5">
          <ProductMark />
          <span className="text-sm font-medium">Agent 6</span>
        </div>
        <div className="hidden max-w-md flex-col gap-3 md:flex">
          <p className="text-lg/relaxed font-medium tracking-tight">
            Ask about the applications you use and get an answer in a few plain
            sentences.
          </p>
          <p className="text-lg/relaxed font-medium tracking-tight text-muted-foreground">
            When something needs fixing, Agent 6 files an issue for the
            developers.
          </p>
        </div>
      </div>
      <main className="flex flex-1 justify-center px-4 py-10 md:items-center md:px-10">
        {/* method="post" keeps the password out of the address bar if the
            form is submitted before the page's script has loaded. */}
        <form
          method="post"
          onSubmit={(event) => void signIn(event)}
          className="flex w-full max-w-sm flex-col gap-6"
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-tight">
              Sign in to Agent 6
            </h1>
            <p className="text-sm text-muted-foreground">
              Use the email and password your Admin gave you.
            </p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={error ? true : undefined}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Accounts are created by your Admin.
          </p>
        </form>
      </main>
      <ThemeSwitch />
    </div>
  )
}

/** Login has no user menu, so it carries its own theme control. */
function ThemeSwitch() {
  const [mode, setMode] = useTheme()
  return (
    <ToggleGroup
      aria-label="Theme"
      variant="outline"
      size="sm"
      spacing={0}
      className="absolute top-4 right-4 max-md:top-3"
      value={[mode]}
      onValueChange={(value) => {
        // Clicking the active item must not clear the choice.
        const next = value.at(0) as ThemeMode | undefined
        if (next) setMode(next)
      }}
    >
      <ToggleGroupItem value="light" aria-label="Light theme" title="Light">
        <SunIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme" title="Dark">
        <MoonIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System theme" title="System">
        <MonitorIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
