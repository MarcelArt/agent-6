import "@tanstack/react-start/server-only"

import { ApiError, notFound } from "./errors"
import {
  ATTACHMENT_KINDS,
  applicationCreate,
  applicationFilters,
  applicationSchema,
  applicationUpdate,
  attachmentPut,
  attachmentSchema,
  attachmentsSchema,
  connectionFilters,
  createdSchema,
  databaseConnectionCreate,
  databaseConnectionSchema,
  databaseConnectionUpdate,
  logConnectionCreate,
  logConnectionSchema,
  logConnectionUpdate,
  pageOf,
  preferredLanguagePut,
  preferredLanguageSchema,
  repositoryCreate,
  repositoryFilters,
  repositorySchema,
  repositoryUpdate,
  ticketAccept,
  ticketDecline,
  ticketFilters,
  ticketSchema,
} from "./schemas"
import type { z } from "zod"
import type { ApiCaller } from "./auth"
import type { AttachmentKind } from "./schemas"
import type { createApplicationActions } from "../application-management"
import type { createDatabaseConnectionActions } from "../database-connection-management"
import type { createLogConnectionActions } from "../log-connection-management"
import type { createRepositoryActions } from "../repository-management"
import type { createSettingsActions } from "../settings-management"
import type { TicketDecisions } from "../ticket-management"
import type { ApiReadsRepository } from "../repositories/api-reads"
import type { ApiPermission } from "@/lib/service-accounts"

export type ApiServices = {
  reads: ApiReadsRepository
  repositories: ReturnType<typeof createRepositoryActions>
  applications: ReturnType<typeof createApplicationActions>
  databaseConnections: ReturnType<typeof createDatabaseConnectionActions>
  logConnections: ReturnType<typeof createLogConnectionActions>
  settings: ReturnType<typeof createSettingsActions>
  tickets: TicketDecisions
}

export type ApiReply =
  | { status: 200; body: unknown }
  | { status: 201; location: string; body: unknown }
  | { status: 204 }

/** What a successful mutation leaves in the audit trail. */
export type AuditNote = {
  operation: string
  targetType: string
  targetId: string
}

export type RouteContext = {
  caller: ApiCaller
  params: Record<string, string>
  query: any
  body: any
  services: ApiServices
  /** Whether the caller holds a permission, for optional projections. */
  can: (permission: ApiPermission) => boolean
  /** Refuses with 403 unless the caller holds the permission. */
  require: (permission: ApiPermission) => void
  audit: (note: AuditNote) => void
}

export type SuccessResponse =
  | { status: 200; description: string; schema: z.ZodType }
  | { status: 201; description: string; schema: z.ZodType }
  | { status: 204; description: string }

export type ApiRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Under /api/v1, with `{name}` path parameters. */
  path: string
  operationId: string
  tag: string
  summary: string
  description?: string
  /** Checked before the route does anything; several mean any one of them. */
  permission: ApiPermission | ReadonlyArray<ApiPermission>
  /** A configuration write: needs all-Applications access as well. */
  allApplications?: boolean
  params?: Record<string, string>
  query?: z.ZodObject
  body?: z.ZodType
  success: Array<SuccessResponse>
  /** Error statuses this route can answer, beyond 401, 403 and 429. */
  errors: Array<number>
  handle: (context: RouteContext) => Promise<ApiReply>
}

const paging = (query: { page: number; pageSize: number }) => ({
  page: query.page,
  pageSize: query.pageSize,
})

const created = (location: string, id: string): ApiReply => ({
  status: 201,
  location: `/api/v1${location}`,
  body: { id },
})

const done: ApiReply = { status: 204 }

/** A domain lookup that failed for a missing record, as the API's 404. */
function exists<T>(read: () => T, what: string): T {
  try {
    return read()
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      (error as { status: unknown }).status === 404
    )
      throw notFound(what)
    throw error
  }
}

const id = (name: string, what: string) => ({ [name]: `The ${what}'s ID.` })

export const API_ROUTES: Array<ApiRoute> = [
  // Repositories
  {
    method: "GET",
    path: "/repositories",
    operationId: "listRepositories",
    tag: "Repositories",
    summary: "List Repositories",
    description:
      "Ordered by full name. A scoped API Key sees Repositories attached to its Applications.",
    permission: "repositories:read",
    query: repositoryFilters,
    success: [
      {
        status: 200,
        description: "A page of Repositories.",
        schema: pageOf(repositorySchema),
      },
    ],
    errors: [400],
    handle: async ({ caller, query, services }) => ({
      status: 200,
      body: services.reads.repositories.list(
        caller.scope,
        paging(query),
        query
      ),
    }),
  },
  {
    method: "POST",
    path: "/repositories",
    operationId: "createRepository",
    tag: "Repositories",
    summary: "Connect a Repository",
    description:
      "Checks that Agent 6's GitHub token can read the repository and that the Tracked Branch exists, then starts the first sync in the background.",
    permission: "repositories:create",
    allApplications: true,
    body: repositoryCreate,
    success: [
      {
        status: 201,
        description: "Connected. Location names the new Repository.",
        schema: createdSchema,
      },
    ],
    errors: [400, 409, 502, 503],
    handle: async ({ body, services, audit }) => {
      const repository = await services.repositories.connect({
        reference: body.fullName,
        trackedBranch: body.trackedBranch,
        tags: body.tags ?? [],
        description: body.description ?? "",
      })
      audit({
        operation: "repositories.create",
        targetType: "repository",
        targetId: repository.id,
      })
      return created(`/repositories/${repository.id}`, repository.id)
    },
  },
  {
    method: "GET",
    path: "/repositories/{repositoryId}",
    operationId: "getRepository",
    tag: "Repositories",
    summary: "Get a Repository",
    permission: "repositories:read",
    params: id("repositoryId", "Repository"),
    success: [
      { status: 200, description: "The Repository.", schema: repositorySchema },
    ],
    errors: [404],
    handle: async ({ caller, params, services }) => {
      const found = services.reads.repositories.get(
        caller.scope,
        params.repositoryId
      )
      if (!found) throw notFound("Repository")
      return { status: 200, body: found }
    },
  },
  {
    method: "PATCH",
    path: "/repositories/{repositoryId}",
    operationId: "updateRepository",
    tag: "Repositories",
    summary: "Update a Repository",
    description:
      "Fields left out keep their value. A new Tracked Branch must exist on GitHub and starts a sync.",
    permission: "repositories:update",
    allApplications: true,
    params: id("repositoryId", "Repository"),
    body: repositoryUpdate,
    success: [{ status: 204, description: "Saved." }],
    errors: [400, 404, 502, 503],
    handle: async ({ params, body, services, audit }) => {
      const before = exists(
        () => services.repositories.existing(params.repositoryId),
        "Repository"
      )
      await services.repositories.update(before.id, {
        trackedBranch: body.trackedBranch ?? before.trackedBranch,
        tags: body.tags ?? before.tags,
        description: body.description ?? before.description,
      })
      audit({
        operation: "repositories.update",
        targetType: "repository",
        targetId: before.id,
      })
      return done
    },
  },
  {
    method: "DELETE",
    path: "/repositories/{repositoryId}",
    operationId: "deleteRepository",
    tag: "Repositories",
    summary: "Remove a Repository",
    description:
      "Removes it from every Application and deletes its clone. Its Tickets keep the Repository's name.",
    permission: "repositories:delete",
    allApplications: true,
    params: id("repositoryId", "Repository"),
    success: [{ status: 204, description: "Removed." }],
    errors: [404],
    handle: async ({ params, services, audit }) => {
      if (!(await services.repositories.remove(params.repositoryId)))
        throw notFound("Repository")
      audit({
        operation: "repositories.delete",
        targetType: "repository",
        targetId: params.repositoryId,
      })
      return done
    },
  },

  // Applications
  {
    method: "GET",
    path: "/applications",
    operationId: "listApplications",
    tag: "Applications",
    summary: "List Applications",
    description:
      "Ordered by name. A scoped API Key sees only its Applications.",
    permission: "applications:read",
    query: applicationFilters,
    success: [
      {
        status: 200,
        description: "A page of Applications.",
        schema: pageOf(applicationSchema),
      },
    ],
    errors: [400],
    handle: async ({ caller, query, services }) => ({
      status: 200,
      body: services.reads.applications.list(
        caller.scope,
        paging(query),
        query
      ),
    }),
  },
  {
    method: "POST",
    path: "/applications",
    operationId: "createApplication",
    tag: "Applications",
    summary: "Create an Application",
    permission: "applications:create",
    allApplications: true,
    body: applicationCreate,
    success: [
      {
        status: 201,
        description: "Created. Location names the new Application.",
        schema: createdSchema,
      },
    ],
    errors: [400],
    handle: async ({ body, services, audit }) => {
      const application = services.applications.create({
        name: body.name,
        description: body.description ?? "",
        notes: body.notes ?? "",
      })
      audit({
        operation: "applications.create",
        targetType: "application",
        targetId: application.id,
      })
      return created(`/applications/${application.id}`, application.id)
    },
  },
  {
    method: "GET",
    path: "/applications/{applicationId}",
    operationId: "getApplication",
    tag: "Applications",
    summary: "Get an Application",
    permission: "applications:read",
    params: id("applicationId", "Application"),
    success: [
      {
        status: 200,
        description: "The Application.",
        schema: applicationSchema,
      },
    ],
    errors: [404],
    handle: async ({ caller, params, services }) => {
      const found = services.reads.applications.get(
        caller.scope,
        params.applicationId
      )
      if (!found) throw notFound("Application")
      return { status: 200, body: found }
    },
  },
  {
    method: "PATCH",
    path: "/applications/{applicationId}",
    operationId: "updateApplication",
    tag: "Applications",
    summary: "Update an Application",
    description: "Fields left out keep their value.",
    permission: "applications:update",
    allApplications: true,
    params: id("applicationId", "Application"),
    body: applicationUpdate,
    success: [{ status: 204, description: "Saved." }],
    errors: [400, 404],
    handle: async ({ params, body, services, audit }) => {
      const before = exists(
        () => services.applications.existing(params.applicationId),
        "Application"
      )
      services.applications.update(before.id, {
        name: body.name ?? before.name,
        description: body.description ?? before.description,
        notes: body.notes ?? before.notes,
      })
      audit({
        operation: "applications.update",
        targetType: "application",
        targetId: before.id,
      })
      return done
    },
  },
  {
    method: "DELETE",
    path: "/applications/{applicationId}",
    operationId: "deleteApplication",
    tag: "Applications",
    summary: "Remove an Application",
    description:
      "Refused with 409 while saved Conversations protect the Application. Its Attachments go with it; the attached resources stay.",
    permission: "applications:delete",
    allApplications: true,
    params: id("applicationId", "Application"),
    success: [{ status: 204, description: "Removed." }],
    errors: [404, 409],
    handle: async ({ params, services, audit }) => {
      exists(
        () => services.applications.existing(params.applicationId),
        "Application"
      )
      services.applications.remove(params.applicationId)
      audit({
        operation: "applications.delete",
        targetType: "application",
        targetId: params.applicationId,
      })
      return done
    },
  },

  // Attachments
  {
    method: "GET",
    path: "/applications/{applicationId}/attachments",
    operationId: "listAttachments",
    tag: "Attachments",
    summary: "List an Application's Attachments",
    description:
      "Repositories first, then Database Connections, then Log Connections, each by name.",
    permission: "attachments:read",
    params: id("applicationId", "Application"),
    success: [
      {
        status: 200,
        description: "Every Attachment of the Application.",
        schema: attachmentsSchema,
      },
    ],
    errors: [404],
    handle: async ({ caller, params, services }) => {
      const found = services.reads.applications.attachments(
        caller.scope,
        params.applicationId
      )
      if (!found) throw notFound("Application")
      return { status: 200, body: { data: found } }
    },
  },
  {
    method: "GET",
    path: "/applications/{applicationId}/attachments/{kind}/{resourceId}",
    operationId: "getAttachment",
    tag: "Attachments",
    summary: "Get one Attachment",
    permission: "attachments:read",
    params: {
      ...id("applicationId", "Application"),
      kind: "repository, database-connection or log-connection.",
      ...id("resourceId", "attached resource"),
    },
    success: [
      { status: 200, description: "The Attachment.", schema: attachmentSchema },
    ],
    errors: [404],
    handle: async ({ caller, params, services }) => {
      const found = services.reads.applications
        .attachments(caller.scope, params.applicationId)
        ?.find(
          (item) =>
            item.kind === params.kind && item.resourceId === params.resourceId
        )
      if (!found) throw notFound("Attachment")
      return { status: 200, body: found }
    },
  },
  {
    method: "PUT",
    path: "/applications/{applicationId}/attachments/{kind}/{resourceId}",
    operationId: "putAttachment",
    tag: "Attachments",
    summary: "Attach a resource, or change a Base Selector",
    description:
      "Creating an Attachment needs attachments:create and widens what the agent can read for the Application. Changing an existing one needs attachments:update; only a Log Attachment has something to change, its Base Selector, which is required for it.",
    permission: ["attachments:create", "attachments:update"],
    allApplications: true,
    params: {
      ...id("applicationId", "Application"),
      kind: "repository, database-connection or log-connection.",
      ...id("resourceId", "resource to attach"),
    },
    body: attachmentPut,
    success: [
      {
        status: 201,
        description: "Attached. Location names the Attachment.",
        schema: createdSchema,
      },
      { status: 204, description: "The Attachment existed and is saved." },
    ],
    errors: [400, 404],
    handle: async ({ params, body, services, require, audit }) => {
      const kind = attachmentKind(params.kind)
      const { applicationId, resourceId } = params
      exists(() => services.applications.existing(applicationId), "Application")
      const existed = services.reads.attachmentExists(
        kind,
        applicationId,
        resourceId
      )
      require(existed ? "attachments:update" : "attachments:create")
      if (kind !== "log-connection" && body.baseSelector !== undefined)
        throw new ApiError(
          400,
          "validation_failed",
          "Only a Log Attachment has a Base Selector. Leave it out.",
          "baseSelector"
        )
      if (kind === "repository")
        exists(
          () =>
            services.applications.attachRepository(applicationId, resourceId),
          "Repository"
        )
      else if (kind === "database-connection")
        exists(
          () => services.databaseConnections.attach(applicationId, resourceId),
          "Database Connection"
        )
      else {
        if (!body.baseSelector)
          throw new ApiError(
            400,
            "validation_failed",
            'A Log Attachment needs a Base Selector, for example {app="billing"}.',
            "baseSelector"
          )
        exists(
          () =>
            services.logConnections.attach(
              applicationId,
              resourceId,
              body.baseSelector
            ),
          "Log Connection"
        )
      }
      audit({
        operation: existed ? "attachments.update" : "attachments.create",
        targetType: kind,
        targetId: `${applicationId}/${resourceId}`,
      })
      return existed
        ? done
        : created(
            `/applications/${applicationId}/attachments/${kind}/${resourceId}`,
            resourceId
          )
    },
  },
  {
    method: "DELETE",
    path: "/applications/{applicationId}/attachments/{kind}/{resourceId}",
    operationId: "deleteAttachment",
    tag: "Attachments",
    summary: "Detach a resource",
    description: "The resource itself stays.",
    permission: "attachments:delete",
    allApplications: true,
    params: {
      ...id("applicationId", "Application"),
      kind: "repository, database-connection or log-connection.",
      ...id("resourceId", "attached resource"),
    },
    success: [{ status: 204, description: "Detached." }],
    errors: [404],
    handle: async ({ params, services, audit }) => {
      const kind = attachmentKind(params.kind)
      const { applicationId, resourceId } = params
      if (!services.reads.attachmentExists(kind, applicationId, resourceId))
        throw notFound("Attachment")
      if (kind === "repository")
        services.applications.detachRepository(applicationId, resourceId)
      else if (kind === "database-connection")
        services.databaseConnections.detach(applicationId, resourceId)
      else services.logConnections.detach(applicationId, resourceId)
      audit({
        operation: "attachments.delete",
        targetType: kind,
        targetId: `${applicationId}/${resourceId}`,
      })
      return done
    },
  },

  // Database Connections
  {
    method: "GET",
    path: "/database-connections",
    operationId: "listDatabaseConnections",
    tag: "Database Connections",
    summary: "List Database Connections",
    description:
      "Ordered by name. With database-connections:read-config, each also has its settings.",
    permission: "database-connections:read",
    query: connectionFilters,
    success: [
      {
        status: 200,
        description: "A page of Database Connections.",
        schema: pageOf(databaseConnectionSchema),
      },
    ],
    errors: [400],
    handle: async ({ caller, query, services, can }) => ({
      status: 200,
      body: services.reads.databaseConnections.list(
        caller.scope,
        paging(query),
        query,
        can("database-connections:read-config")
      ),
    }),
  },
  {
    method: "POST",
    path: "/database-connections",
    operationId: "createDatabaseConnection",
    tag: "Database Connections",
    summary: "Create a Database Connection",
    description:
      "Tests the connection and saves the result; a failed test still saves. The agent's queries stay read-only whatever the user may do.",
    permission: "database-connections:create",
    allApplications: true,
    body: databaseConnectionCreate,
    success: [
      {
        status: 201,
        description: "Created. Location names the new connection.",
        schema: createdSchema,
      },
    ],
    errors: [400],
    handle: async ({ body, services, audit }) => {
      const connection = await services.databaseConnections.save({
        name: body.name,
        host: body.host,
        port: body.port,
        database: body.database,
        user: body.user,
        password: body.password ?? "",
        sslMode: body.sslMode,
        tags: body.tags ?? [],
        description: body.description ?? "",
      })
      audit({
        operation: "database-connections.create",
        targetType: "database-connection",
        targetId: connection.id,
      })
      return created(`/database-connections/${connection.id}`, connection.id)
    },
  },
  {
    method: "GET",
    path: "/database-connections/{databaseConnectionId}",
    operationId: "getDatabaseConnection",
    tag: "Database Connections",
    summary: "Get a Database Connection",
    permission: "database-connections:read",
    params: id("databaseConnectionId", "Database Connection"),
    success: [
      {
        status: 200,
        description: "The Database Connection.",
        schema: databaseConnectionSchema,
      },
    ],
    errors: [404],
    handle: async ({ caller, params, services, can }) => {
      const found = services.reads.databaseConnections.get(
        caller.scope,
        params.databaseConnectionId,
        can("database-connections:read-config")
      )
      if (!found) throw notFound("Database Connection")
      return { status: 200, body: found }
    },
  },
  {
    method: "PATCH",
    path: "/database-connections/{databaseConnectionId}",
    operationId: "updateDatabaseConnection",
    tag: "Database Connections",
    summary: "Update a Database Connection",
    description:
      "Fields left out keep their value; leaving out password keeps the saved one. Changing host, port, database, user or SSL mode needs the password again. Saving tests the connection.",
    permission: "database-connections:update",
    allApplications: true,
    params: id("databaseConnectionId", "Database Connection"),
    body: databaseConnectionUpdate,
    success: [{ status: 204, description: "Saved." }],
    errors: [400, 404],
    handle: async ({ params, body, services, audit }) => {
      const before = exists(
        () =>
          services.databaseConnections.existing(params.databaseConnectionId),
        "Database Connection"
      )
      await services.databaseConnections.save(
        {
          name: body.name ?? before.name,
          host: body.host ?? before.host,
          port: body.port ?? before.port,
          database: body.database ?? before.database,
          user: body.user ?? before.user,
          password: body.password ?? "",
          sslMode: body.sslMode ?? before.sslMode,
          tags: body.tags ?? before.tags,
          description: body.description ?? before.description,
        },
        before.id
      )
      audit({
        operation: "database-connections.update",
        targetType: "database-connection",
        targetId: before.id,
      })
      return done
    },
  },
  {
    method: "DELETE",
    path: "/database-connections/{databaseConnectionId}",
    operationId: "deleteDatabaseConnection",
    tag: "Database Connections",
    summary: "Remove a Database Connection",
    description:
      "Removes it from every Application and deletes its saved password.",
    permission: "database-connections:delete",
    allApplications: true,
    params: id("databaseConnectionId", "Database Connection"),
    success: [{ status: 204, description: "Removed." }],
    errors: [404],
    handle: async ({ params, services, audit }) => {
      exists(
        () => services.databaseConnections.remove(params.databaseConnectionId),
        "Database Connection"
      )
      audit({
        operation: "database-connections.delete",
        targetType: "database-connection",
        targetId: params.databaseConnectionId,
      })
      return done
    },
  },

  // Log Connections
  {
    method: "GET",
    path: "/log-connections",
    operationId: "listLogConnections",
    tag: "Log Connections",
    summary: "List Log Connections",
    description:
      "Ordered by name. With log-connections:read-config, each also has its settings.",
    permission: "log-connections:read",
    query: connectionFilters,
    success: [
      {
        status: 200,
        description: "A page of Log Connections.",
        schema: pageOf(logConnectionSchema),
      },
    ],
    errors: [400],
    handle: async ({ caller, query, services, can }) => ({
      status: 200,
      body: services.reads.logConnections.list(
        caller.scope,
        paging(query),
        query,
        can("log-connections:read-config")
      ),
    }),
  },
  {
    method: "POST",
    path: "/log-connections",
    operationId: "createLogConnection",
    tag: "Log Connections",
    summary: "Create a Log Connection",
    description:
      "Tests the connection and saves the result; a failed test still saves. Without the secret its auth type needs, it is saved Needs Secret and not tested.",
    permission: "log-connections:create",
    allApplications: true,
    body: logConnectionCreate,
    success: [
      {
        status: 201,
        description: "Created. Location names the new connection.",
        schema: createdSchema,
      },
    ],
    errors: [400],
    handle: async ({ body, services, audit }) => {
      const connection = await services.logConnections.save({
        name: body.name,
        baseUrl: body.baseUrl,
        authType: body.authType,
        authUsername: body.authUsername ?? "",
        authSecret: body.authSecret ?? "",
        tenantId: body.tenantId ?? "",
        tags: body.tags ?? [],
        description: body.description ?? "",
      })
      audit({
        operation: "log-connections.create",
        targetType: "log-connection",
        targetId: connection.id,
      })
      return created(`/log-connections/${connection.id}`, connection.id)
    },
  },
  {
    method: "GET",
    path: "/log-connections/{logConnectionId}",
    operationId: "getLogConnection",
    tag: "Log Connections",
    summary: "Get a Log Connection",
    permission: "log-connections:read",
    params: id("logConnectionId", "Log Connection"),
    success: [
      {
        status: 200,
        description: "The Log Connection.",
        schema: logConnectionSchema,
      },
    ],
    errors: [404],
    handle: async ({ caller, params, services, can }) => {
      const found = services.reads.logConnections.get(
        caller.scope,
        params.logConnectionId,
        can("log-connections:read-config")
      )
      if (!found) throw notFound("Log Connection")
      return { status: 200, body: found }
    },
  },
  {
    method: "PATCH",
    path: "/log-connections/{logConnectionId}",
    operationId: "updateLogConnection",
    tag: "Log Connections",
    summary: "Update a Log Connection",
    description:
      "Fields left out keep their value; leaving out authSecret keeps the saved one of the same auth type. Changing base URL, tenant ID or username needs the secret again. Saving tests the connection.",
    permission: "log-connections:update",
    allApplications: true,
    params: id("logConnectionId", "Log Connection"),
    body: logConnectionUpdate,
    success: [{ status: 204, description: "Saved." }],
    errors: [400, 404],
    handle: async ({ params, body, services, audit }) => {
      const before = exists(
        () => services.logConnections.existing(params.logConnectionId),
        "Log Connection"
      )
      await services.logConnections.save(
        {
          name: body.name ?? before.name,
          baseUrl: body.baseUrl ?? before.baseUrl,
          authType: body.authType ?? before.authType,
          authUsername: body.authUsername ?? before.authUsername,
          authSecret: body.authSecret ?? "",
          tenantId: body.tenantId ?? before.tenantId,
          tags: body.tags ?? before.tags,
          description: body.description ?? before.description,
        },
        before.id
      )
      audit({
        operation: "log-connections.update",
        targetType: "log-connection",
        targetId: before.id,
      })
      return done
    },
  },
  {
    method: "DELETE",
    path: "/log-connections/{logConnectionId}",
    operationId: "deleteLogConnection",
    tag: "Log Connections",
    summary: "Remove a Log Connection",
    description:
      "Removes it from every Application and deletes its saved secret.",
    permission: "log-connections:delete",
    allApplications: true,
    params: id("logConnectionId", "Log Connection"),
    success: [{ status: 204, description: "Removed." }],
    errors: [404],
    handle: async ({ params, services, audit }) => {
      exists(
        () => services.logConnections.remove(params.logConnectionId),
        "Log Connection"
      )
      audit({
        operation: "log-connections.delete",
        targetType: "log-connection",
        targetId: params.logConnectionId,
      })
      return done
    },
  },

  // Preferred Language
  {
    method: "GET",
    path: "/preferred-language",
    operationId: "getPreferredLanguage",
    tag: "Preferred Language",
    summary: "Get the Preferred Language",
    permission: "preferred-language:read",
    success: [
      {
        status: 200,
        description: "The organization's Preferred Language.",
        schema: preferredLanguageSchema,
      },
    ],
    errors: [],
    handle: async ({ services }) => ({
      status: 200,
      body: services.settings.get(),
    }),
  },
  {
    method: "PUT",
    path: "/preferred-language",
    operationId: "putPreferredLanguage",
    tag: "Preferred Language",
    summary: "Set the Preferred Language",
    description:
      "The agent answers everyone in it from the next message. A language other than English or Indonesian needs the model to prepare the agent's fixed messages first; if that fails, nothing changes and the answer is 502.",
    permission: "preferred-language:update",
    allApplications: true,
    body: preferredLanguagePut,
    success: [{ status: 204, description: "Saved." }],
    errors: [400, 502],
    handle: async ({ body, services, audit }) => {
      const result = await services.settings.save(body.preferredLanguage)
      if (!result.ok)
        throw result.field
          ? new ApiError(400, "validation_failed", result.message, result.field)
          : new ApiError(502, "upstream_failed", result.message)
      audit({
        operation: "preferred-language.update",
        targetType: "setting",
        targetId: "preferredLanguage",
      })
      return done
    },
  },

  // Tickets
  {
    method: "GET",
    path: "/tickets",
    operationId: "listTickets",
    tag: "Tickets",
    summary: "List Tickets",
    description:
      "Newest first, every status unless filtered. With tickets:read-details, each also has its developer details.",
    permission: "tickets:read",
    query: ticketFilters,
    success: [
      {
        status: 200,
        description: "A page of Tickets.",
        schema: pageOf(ticketSchema),
      },
    ],
    errors: [400],
    handle: async ({ caller, query, services, can }) => ({
      status: 200,
      body: services.reads.tickets.list(
        caller.scope,
        paging(query),
        query,
        can("tickets:read-details")
      ),
    }),
  },
  {
    method: "GET",
    path: "/tickets/{ticketId}",
    operationId: "getTicket",
    tag: "Tickets",
    summary: "Get a Ticket",
    description:
      "Read a Ticket again before retrying a decision whose result you did not receive.",
    permission: "tickets:read",
    params: id("ticketId", "Ticket"),
    success: [
      { status: 200, description: "The Ticket.", schema: ticketSchema },
    ],
    errors: [404],
    handle: async ({ caller, params, services, can }) => {
      const found = services.reads.tickets.get(
        caller.scope,
        params.ticketId,
        can("tickets:read-details")
      )
      if (!found) throw notFound("Ticket")
      return { status: 200, body: found }
    },
  },
  {
    method: "POST",
    path: "/tickets/{ticketId}/accept",
    operationId: "acceptTicket",
    tag: "Tickets",
    summary: "Accept a Ticket",
    description:
      "Files the Ticket exactly as stored: a new GitHub issue, or an occurrence comment on its target issue. Answers 204 once the Filed Issue is recorded. A GitHub failure answers 502 and leaves the Ticket pending; a Ticket that is decided or being filed answers 409.",
    permission: "tickets:accept",
    params: id("ticketId", "Ticket"),
    body: ticketAccept,
    success: [{ status: 204, description: "Accepted and filed." }],
    errors: [400, 404, 409, 502, 503],
    handle: async ({ caller, params, services }) => {
      if (!services.reads.tickets.get(caller.scope, params.ticketId, false))
        throw notFound("Ticket")
      await services.tickets.acceptStored(params.ticketId, caller.actor)
      return done
    },
  },
  {
    method: "POST",
    path: "/tickets/{ticketId}/decline",
    operationId: "declineTicket",
    tag: "Tickets",
    summary: "Decline a Ticket",
    description:
      "The Conversation's owner reads the reason exactly as written. A Ticket that is decided or being filed answers 409.",
    permission: "tickets:decline",
    params: id("ticketId", "Ticket"),
    body: ticketDecline,
    success: [{ status: 204, description: "Declined." }],
    errors: [400, 404, 409],
    handle: async ({ caller, params, body, services }) => {
      if (!services.reads.tickets.get(caller.scope, params.ticketId, false))
        throw notFound("Ticket")
      await services.tickets.decline(params.ticketId, body.reason, caller.actor)
      return done
    },
  },
]

function attachmentKind(value: string): AttachmentKind {
  const kind = ATTACHMENT_KINDS.find((item) => item === value)
  if (!kind) throw notFound("Attachment kind")
  return kind
}
