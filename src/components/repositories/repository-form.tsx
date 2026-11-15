import { useEffect, useRef, useState } from "react"
import { GitBranchIcon, LockIcon } from "lucide-react"
import type {
  Repository,
  RepositoryCheck,
  RepositoryField,
  RepositoryResult,
} from "@/lib/repositories"
import {
  FormActions,
  FormError,
  Optional,
  RecordForm,
} from "@/components/records/record-detail"
import { TagsInput } from "@/components/records/tags-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  MAX_DESCRIPTION_LENGTH,
  TOKEN_MISSING_MESSAGE,
} from "@/lib/repositories"
import {
  checkRepository,
  listRepositoryBranches,
} from "@/server/repositories.functions"

export type RepositoryFormValues = {
  /** "owner/name". Only used when connecting. */
  reference: string
  trackedBranch: string
  tags: Array<string>
  description: string
}

type Problem = { message: string; field?: RepositoryField }

const UNREACHABLE =
  "Agent 6 could not be reached, so nothing was saved. Check your connection, then try again."

/**
 * The connect and edit form of a Repository. With `repository` it edits:
 * the GitHub repository is fixed and only the other fields can change.
 */
export function RepositoryForm({
  repository,
  problem: outsideProblem,
  notice,
  save,
  onSaved,
  cancel,
}: {
  repository?: Repository
  /** A problem from an action outside the form, such as Sync now. */
  problem?: Problem
  /** Shown at the top of the form, above the fields. */
  notice?: React.ReactNode
  save: (values: RepositoryFormValues) => Promise<RepositoryResult>
  onSaved: (repository: Repository) => void | Promise<void>
  /** The Cancel link, back to the list. */
  cancel: React.ReactNode
}) {
  const [reference, setReference] = useState("")
  /** The repository on GitHub that `reference` was found to be. */
  const [found, setFound] = useState<RepositoryCheck & { ok: true }>()
  const [checking, setChecking] = useState(false)
  /** The text the running or finished check is about. */
  const checkedText = useRef<string>(undefined)

  const [branch, setBranch] = useState(repository?.trackedBranch)
  const [branches, setBranches] = useState(
    repository ? [repository.trackedBranch] : []
  )
  const [branchesProblem, setBranchesProblem] = useState<string>()
  const [tags, setTags] = useState(repository?.tags ?? [])

  const [ownProblem, setOwnProblem] = useState<Problem>()
  const [pending, setPending] = useState(false)
  const problem = ownProblem ?? outsideProblem

  // On edit, the branches come from GitHub once the form is open. Until
  // then, and if GitHub fails, the Tracked Branch is the only choice.
  const repositoryId = repository?.id
  useEffect(() => {
    if (!repositoryId) return
    let current = true
    listRepositoryBranches({ data: { repositoryId } }).then(
      (result) => {
        if (!current) return
        if (result.ok) setBranches(result.branches)
        // The missing token is already reported next to the list.
        else if (result.message !== TOKEN_MISSING_MESSAGE) {
          setBranchesProblem(result.message)
        }
      },
      () => {
        if (current) setBranchesProblem("Agent 6 could not be reached.")
      }
    )
    return () => {
      current = false
    }
  }, [repositoryId])

  /** Asks GitHub about the typed repository and fills in its branches. */
  async function check() {
    const text = reference.trim()
    if (!text || text === checkedText.current) return
    checkedText.current = text
    setFound(undefined)
    setBranch(undefined)
    setOwnProblem(undefined)
    setChecking(true)
    let result: RepositoryCheck | undefined
    try {
      result = await checkRepository({ data: { reference: text } })
    } catch {
      // Stays unchecked, so leaving the field again retries.
    }
    // The text was changed meanwhile: this answer is about something else.
    if (checkedText.current !== text) return
    setChecking(false)
    if (!result) {
      checkedText.current = undefined
      setOwnProblem({ message: UNREACHABLE })
    } else if (result.ok) {
      setFound(result)
      setBranches(result.branches)
      setBranch(result.defaultBranch)
    } else {
      setOwnProblem(result)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!repository && !found) {
      await check()
      return
    }
    if (!branch) return
    const form = new FormData(event.currentTarget)
    setOwnProblem(undefined)
    setPending(true)
    try {
      const result = await save({
        reference: found?.fullName ?? "",
        trackedBranch: branch,
        tags,
        description: String(form.get("description")),
      })
      if (result.ok) {
        await onSaved(result.repository)
        return
      }
      setOwnProblem(result)
    } catch {
      setOwnProblem({ message: UNREACHABLE })
    }
    setPending(false)
  }

  /** Props that mark a control and its Field as the one with the error. */
  const invalid = (field: RepositoryField) =>
    problem?.field === field ? true : undefined
  const errorOf = (field: RepositoryField) =>
    problem?.field === field && (
      <FieldError id={`repository-${field}-error`}>
        {problem.message}
      </FieldError>
    )
  const describedBy = (field: RepositoryField, hint?: string) =>
    [hint, problem?.field === field ? `repository-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined

  const branchItems = branches.map((name) => ({ value: name, label: name }))
  const branchPlaceholder = checking
    ? "Checking the repository…"
    : "Check the repository first"

  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {notice}
      {problem && !problem.field && (
        <FormError
          title={repository ? "Nothing was changed" : "Nothing was connected"}
        >
          {problem.message}
        </FormError>
      )}
      <FieldGroup>
        <Field data-invalid={invalid("repository")}>
          <FieldLabel htmlFor="repository-reference">
            GitHub repository
          </FieldLabel>
          {repository ? (
            <InputGroup>
              <InputGroupInput
                id="repository-reference"
                value={repository.fullName}
                readOnly
              />
              <InputGroupAddon align="inline-end" title="Read-only">
                <LockIcon />
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <>
              <Input
                id="repository-reference"
                value={reference}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                autoFocus
                aria-invalid={invalid("repository")}
                aria-describedby={describedBy(
                  "repository",
                  "repository-reference-hint"
                )}
                onChange={(event) => {
                  setReference(event.target.value)
                  // What was found belongs to the old text.
                  if (event.target.value.trim() !== checkedText.current) {
                    checkedText.current = undefined
                    setFound(undefined)
                    setBranch(undefined)
                    setChecking(false)
                    setOwnProblem(undefined)
                  }
                }}
                onBlur={() => void check()}
                onKeyDown={(event) => {
                  // Enter checks the repository instead of submitting.
                  if (event.key === "Enter" && !found) {
                    event.preventDefault()
                    void check()
                  }
                }}
              />
              <FieldDescription id="repository-reference-hint">
                Enter owner/name or a GitHub URL.
              </FieldDescription>
            </>
          )}
          {errorOf("repository")}
        </Field>
        <Field data-invalid={invalid("trackedBranch")}>
          <FieldLabel htmlFor="repository-branch">Tracked Branch</FieldLabel>
          <Select
            items={branchItems}
            value={branch ?? null}
            onValueChange={(value) => setBranch(value ?? undefined)}
            disabled={!repository && !found}
          >
            <SelectTrigger
              id="repository-branch"
              className="w-full"
              aria-invalid={invalid("trackedBranch")}
              aria-describedby={describedBy(
                "trackedBranch",
                "repository-branch-hint"
              )}
            >
              <GitBranchIcon className="text-muted-foreground" />
              <SelectValue placeholder={branchPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {branchItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id="repository-branch-hint">
            {repository
              ? "The agent reads only this branch. Changing it syncs again."
              : "The agent reads only this branch."}
            {branchesProblem &&
              ` The other branches could not be loaded: ${branchesProblem}`}
          </FieldDescription>
          {errorOf("trackedBranch")}
        </Field>
        <Field data-invalid={invalid("tags")}>
          <FieldLabel htmlFor="repository-tags">Tags</FieldLabel>
          <TagsInput
            id="repository-tags"
            value={tags}
            onChange={setTags}
            aria-invalid={invalid("tags")}
            aria-describedby={describedBy("tags", "repository-tags-hint")}
          />
          <FieldDescription id="repository-tags-hint">
            Tell the agent what this Repository is for. Tags never grant access.
          </FieldDescription>
          {errorOf("tags")}
        </Field>
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="repository-description">
            <span>
              Description <Optional />
            </span>
          </FieldLabel>
          <Textarea
            id="repository-description"
            name="description"
            defaultValue={repository?.description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            aria-invalid={invalid("description")}
            aria-describedby={describedBy(
              "description",
              "repository-description-hint"
            )}
          />
          <FieldDescription id="repository-description-hint">
            What this code is, in one or two sentences. The agent reads it.
          </FieldDescription>
          {errorOf("description")}
        </Field>
      </FieldGroup>
      <FormActions>
        <Button
          type="submit"
          disabled={pending || checking || (!repository && !found)}
        >
          {repository ? "Save changes" : "Connect repository"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
