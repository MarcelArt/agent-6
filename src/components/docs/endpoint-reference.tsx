import { Badge } from "@/components/ui/badge"
import {
  Code,
  DocSection,
  DocSubsection,
  DocTable,
  InlineText,
  linkClass,
} from "./docs-shell"
import { SchemaFields, constraints, typeLabel } from "./schema-fields"
import type { TocEntry } from "./docs-shell"
import type { JsonSchema } from "./schema-fields"

/*
 * The endpoint reference, generated from the OpenAPI document the API
 * serves, so the page always describes the endpoints as they validate.
 */

type Parameter = {
  name: string
  in: "path" | "query"
  required?: boolean
  description?: string
  schema: JsonSchema
}

type Response = {
  $ref?: string
  description?: string
  content?: { "application/json"?: { schema?: JsonSchema } }
}

export type Operation = {
  operationId: string
  tags?: Array<string>
  summary: string
  description?: string
  "x-agent6-permissions"?: Array<string>
  "x-agent6-all-applications"?: boolean
  parameters?: Array<Parameter>
  requestBody?: {
    required?: boolean
    content: { "application/json": { schema: JsonSchema } }
  }
  responses: Record<string, Response>
}

/** The parts of the OpenAPI document (src/lib/openapi.ts) this page reads. */
export type ReferenceDocument = {
  servers: Array<{ url: string }>
  tags: Array<{ name: string }>
  paths: Record<string, Record<string, Operation>>
  components: {
    responses: Partial<Record<string, { description: string }>>
  }
}

type Endpoint = { method: string; path: string; operation: Operation }

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-")

/** Endpoints by tag, in the document's tag order, without the document itself. */
export function endpointsByTag(document: ReferenceDocument) {
  const all: Array<Endpoint> = Object.entries(document.paths).flatMap(
    ([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        operation,
      }))
  )
  return document.tags
    .map((tag) => ({
      tag: tag.name,
      id: `endpoints-${slug(tag.name)}`,
      endpoints: all.filter((item) => item.operation.tags?.includes(tag.name)),
    }))
    .filter((group) => group.endpoints.length)
}

export function endpointToc(document: ReferenceDocument): Array<TocEntry> {
  return endpointsByTag(document).map((group) => ({
    id: group.id,
    label: group.tag,
  }))
}

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="outline" className="font-mono text-xs">
      {method}
    </Badge>
  )
}

export function EndpointReference({
  document,
}: {
  document: ReferenceDocument
}) {
  return (
    <DocSection id="endpoints" title="Endpoints">
      <p className="text-sm/relaxed">
        Paths are relative to{" "}
        <Code>{document.servers[0]?.url ?? "/api/v1"}</Code>. Every endpoint
        answers 401 for a bad API Key, 403 for a missing permission and 429 when
        rate-limited; the others it can answer are listed with it and described
        under{" "}
        <a href="#errors" className={linkClass}>
          Errors
        </a>
        .
      </p>
      {endpointsByTag(document).map((group) => (
        <section
          key={group.id}
          aria-labelledby={group.id}
          className="flex flex-col gap-6 border-t pt-6"
        >
          <h3 id={group.id} className="scroll-mt-20 text-sm font-medium">
            {group.tag}
          </h3>
          <ul className="flex flex-col gap-1 text-xs">
            {group.endpoints.map(({ method, path, operation }) => (
              <li
                key={operation.operationId}
                className="flex min-w-0 items-baseline gap-2"
              >
                <span className="w-14 shrink-0 font-mono text-muted-foreground">
                  {method}
                </span>
                <a
                  href={`#${operation.operationId}`}
                  className={`${linkClass} min-w-0 font-mono break-all`}
                >
                  {path}
                </a>
              </li>
            ))}
          </ul>
          {group.endpoints.map((endpoint) => (
            <EndpointDetail
              key={endpoint.operation.operationId}
              endpoint={endpoint}
            />
          ))}
        </section>
      ))}
    </DocSection>
  )
}

function EndpointDetail({ endpoint }: { endpoint: Endpoint }) {
  const { method, path, operation } = endpoint
  const permissions = operation["x-agent6-permissions"] ?? []
  // The permission sentence is shown on its own line.
  const description = (operation.description ?? "")
    .split("\n\n")
    .filter((paragraph) => !paragraph.startsWith("Requires "))
  const body = operation.requestBody?.content["application/json"].schema
  const statuses = Object.entries(operation.responses)
  const successes = statuses.filter(([, response]) => !response.$ref)
  const errors = statuses
    .filter(([, response]) => response.$ref)
    .map(([status]) => status)
  return (
    <DocSubsection
      id={operation.operationId}
      title={
        <span className="flex flex-col gap-1.5">
          <span>{operation.summary}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-2 font-normal">
            <MethodBadge method={method} />
            <code className="min-w-0 font-mono text-xs break-all">{path}</code>
          </span>
        </span>
      }
    >
      {description.map((paragraph) => (
        <p key={paragraph} className="text-sm/relaxed">
          <InlineText text={paragraph} />
        </p>
      ))}
      <p className="text-xs/relaxed text-muted-foreground">
        Permission:{" "}
        {permissions.map((permission, index) => (
          <span key={permission}>
            {index > 0 && " or "}
            <Code>{permission}</Code>
          </span>
        ))}
        {operation["x-agent6-all-applications"] &&
          ", with All Applications access"}
        .
      </p>
      {operation.parameters?.length ? (
        <DocTable
          caption={`Parameters of ${operation.summary}`}
          head={["Parameter", "In", "Type", "Description"]}
        >
          {operation.parameters.map((parameter) => (
            <tr key={`${parameter.in}:${parameter.name}`}>
              <td className="w-[1%] whitespace-nowrap">
                <Code>{parameter.name}</Code>
              </td>
              <td>{parameter.in}</td>
              <td className="font-mono">{typeLabel(parameter.schema)}</td>
              <td>
                {parameter.description && (
                  <InlineText text={parameter.description} />
                )}
                {constraints(parameter.schema).length > 0 && (
                  <span className="block text-muted-foreground">
                    {constraints(parameter.schema).join(" ")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </DocTable>
      ) : null}
      {body && (
        <Disclosure
          label={
            operation.requestBody?.required === false
              ? "Request body (optional, JSON)"
              : "Request body (JSON)"
          }
        >
          {body.description && (
            <p className="text-xs/relaxed">
              <InlineText text={body.description} />
            </p>
          )}
          <SchemaFields
            schema={body}
            caption={`Request body of ${operation.summary}`}
            mode="request"
          />
        </Disclosure>
      )}
      {successes.map(([status, response]) => {
        const schema = response.content?.["application/json"]?.schema
        return schema ? (
          <Disclosure
            key={status}
            label={`${status}: ${response.description ?? ""}`}
          >
            <SchemaFields
              schema={schema}
              caption={`${status} response of ${operation.summary}`}
              mode="response"
            />
          </Disclosure>
        ) : (
          <p key={status} className="text-xs/relaxed">
            <Code>{status}</Code> {response.description}
          </p>
        )
      })}
      {errors.length > 0 && (
        <p className="text-xs/relaxed text-muted-foreground">
          Errors:{" "}
          {errors.map((status, index) => (
            <span key={status}>
              {index > 0 && ", "}
              <a href={`#error-${status}`} className={linkClass}>
                {status}
              </a>
            </span>
          ))}
          .
        </p>
      )}
    </DocSubsection>
  )
}

/** A native disclosure: keyboard-accessible and closed until wanted. */
function Disclosure({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <details className="group rounded-md border">
      <summary className="cursor-pointer rounded-md px-3 py-2 text-xs font-medium outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30">
        {label}
      </summary>
      <div className="flex flex-col gap-3 border-t p-3">{children}</div>
    </details>
  )
}
