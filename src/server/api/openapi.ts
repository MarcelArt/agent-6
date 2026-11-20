import { z } from "zod"
import { errorSchema } from "./schemas"
import type { ApiRoute } from "./routes"

/*
 * The OpenAPI 3.1 document of API v1, generated from the route table and
 * the schemas the router validates with. Serve it, never hand-edit it.
 */

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "The request is invalid. `field` names the problem when there is one.",
  401: "The API Key is missing, malformed, unknown, expired or revoked, or its Service Account is disabled.",
  403: "The API Key lacks the permission, or the change needs All Applications access.",
  404: "No such record within the API Key's Application scope.",
  405: "The path exists for other methods; the Allow header lists them.",
  409: "The record's state does not allow this, for example a Ticket that is decided or being filed.",
  413: "The body is larger than 64 KB.",
  415: "The body is not sent as application/json.",
  429: "Too many requests; Retry-After says how many seconds to wait.",
  502: "A service Agent 6 depends on, such as GitHub or the model, failed. Nothing was decided.",
  503: "A service Agent 6 needs is not configured or not available right now.",
}

/** JSON Schema 2020-12 for OpenAPI 3.1, without the noise of a regex date pattern. */
export function jsonSchema(schema: z.ZodType, io: "input" | "output") {
  const result = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
  }) as Record<string, unknown>
  delete result.$schema
  return tidy(result) as Record<string, unknown>
}

function tidy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(tidy)
  if (!value || typeof value !== "object") return value
  const entries = Object.entries(value as Record<string, unknown>)
  const isDate = entries.some(
    ([key, item]) => key === "format" && item === "date-time"
  )
  return Object.fromEntries(
    entries
      .filter(([key]) => !(isDate && key === "pattern"))
      .filter(
        ([key, item]) =>
          !(key === "maximum" && item === Number.MAX_SAFE_INTEGER)
      )
      .filter(
        ([key, item]) =>
          !(key === "minimum" && item === Number.MIN_SAFE_INTEGER)
      )
      .map(([key, item]) => [key, tidy(item)])
  )
}

/** The permissions a route needs, as a sentence. */
export function permissionText(route: ApiRoute) {
  const permissions =
    typeof route.permission === "string"
      ? [route.permission]
      : [...route.permission]
  return `Requires ${permissions.map((item) => `\`${item}\``).join(" or ")}${
    route.allApplications ? " and All Applications access" : ""
  }.`
}

export function buildOpenApiDocument(
  routes: Array<ApiRoute>,
  options: { baseUrl: string }
) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of routes) {
    const parameters = [
      ...Object.entries(route.params ?? {}).map(([name, description]) => ({
        name,
        in: "path",
        required: true,
        description,
        schema:
          name === "kind"
            ? {
                type: "string",
                enum: ["repository", "database-connection", "log-connection"],
              }
            : { type: "string" },
      })),
      ...Object.entries(
        (route.query
          ? (jsonSchema(route.query, "input").properties as Record<
              string,
              Record<string, unknown>
            >)
          : undefined) ?? {}
      ).map(([name, schema]) => {
        const { description, ...rest } = schema
        return { name, in: "query", required: false, description, schema: rest }
      }),
    ]
    const responses: Record<string, unknown> = {}
    for (const success of route.success)
      responses[String(success.status)] = {
        description: success.description,
        ...(success.status === 201
          ? {
              headers: {
                Location: {
                  description: "The address of the new record.",
                  schema: { type: "string" },
                },
              },
            }
          : {}),
        ...("schema" in success
          ? {
              content: {
                "application/json": {
                  schema: jsonSchema(success.schema, "output"),
                },
              },
            }
          : {}),
      }
    for (const status of [...new Set([...route.errors, 401, 403, 429])].sort())
      responses[String(status)] = {
        $ref: `#/components/responses/Error${status}`,
      }
    paths[route.path] ??= {}
    paths[route.path][route.method.toLowerCase()] = {
      operationId: route.operationId,
      tags: [route.tag],
      summary: route.summary,
      description: [route.description, permissionText(route)]
        .filter(Boolean)
        .join("\n\n"),
      "x-agent6-permissions":
        typeof route.permission === "string"
          ? [route.permission]
          : route.permission,
      "x-agent6-all-applications": route.allApplications ?? false,
      ...(parameters.length ? { parameters } : {}),
      ...(route.body
        ? {
            requestBody: {
              required: route.operationId !== "acceptTicket",
              content: {
                "application/json": { schema: jsonSchema(route.body, "input") },
              },
            },
          }
        : {}),
      responses,
      security: [{ apiKey: [] }],
    }
  }
  paths["/openapi.json"] = {
    get: {
      operationId: "getOpenApiDocument",
      tags: ["Reference"],
      summary: "This document",
      description: "Public; needs no API Key.",
      security: [],
      responses: {
        "200": {
          description: "The OpenAPI document.",
          content: { "application/json": {} },
        },
      },
    },
  }
  const statuses = [400, 401, 403, 404, 405, 409, 413, 415, 429, 502, 503]
  return {
    openapi: "3.1.0",
    info: {
      title: "Agent 6 API",
      version: "1",
      description:
        "Manage Agent 6 configuration and review Tickets. Authenticate with `Authorization: Bearer <API Key>`. A new API Key has no permissions; an Admin grants them per key. See /docs/api.",
    },
    servers: [{ url: `${options.baseUrl.replace(/\/$/, "")}/api/v1` }],
    tags: [
      "Repositories",
      "Applications",
      "Attachments",
      "Database Connections",
      "Log Connections",
      "Preferred Language",
      "Tickets",
    ].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "An API Key issued to a Service Account in Agent 6.",
        },
      },
      schemas: { Error: jsonSchema(errorSchema, "output") },
      responses: Object.fromEntries(
        statuses.map((status) => [
          `Error${status}`,
          {
            description: ERROR_DESCRIPTIONS[status],
            ...(status === 429
              ? { headers: { "Retry-After": { schema: { type: "integer" } } } }
              : status === 405
                ? { headers: { Allow: { schema: { type: "string" } } } }
                : {}),
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        ])
      ),
    },
  }
}
