import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon } from "lucide-react"
import {
  API_LIMITS,
  ERROR_CODES,
  EXAMPLE_API_KEY,
} from "@/components/docs/api-content"
import { CodeBlock, JsonBlock } from "@/components/docs/code-block"
import {
  Code,
  DocSection,
  DocSubsection,
  DocTable,
  DocsPage,
  Prose,
  linkClass,
} from "@/components/docs/docs-shell"
import {
  EndpointReference,
  endpointToc,
} from "@/components/docs/endpoint-reference"
import type { ReferenceDocument } from "@/components/docs/endpoint-reference"
import { buttonVariants } from "@/components/ui/button"
import { PERMISSION_GROUPS } from "@/lib/service-accounts"
import { getApiReference } from "@/server/api-docs.functions"

export const Route = createFileRoute("/docs/api")({
  loader: () => getApiReference(),
  head: () => ({ meta: [{ title: "API reference · Agent 6" }] }),
  component: Page,
})

function Page() {
  // Plain JSON; the reference reads it through its own narrower types.
  const document = Route.useLoaderData() as unknown as ReferenceDocument
  const base = document.servers[0]?.url ?? "/api/v1"
  const ticketId = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b"
  const auth = `-H "Authorization: Bearer $AGENT6_API_KEY"`
  return (
    <DocsPage
      title="API reference"
      intro={
        <div className="flex flex-col items-start gap-3">
          <p>
            Agent 6's API lets an external integration manage Repositories,
            Applications, Attachments, connections and the Preferred Language,
            and review the Tickets the agent creates. Version 1 is served at{" "}
            <Code>{base}</Code>.
          </p>
          <a
            href="/api/v1/openapi.json"
            download="agent6-openapi.json"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <DownloadIcon />
            Download the OpenAPI document
          </a>
        </div>
      }
      toc={[
        { id: "overview", label: "Requests and authentication" },
        { id: "keys", label: "Getting and rotating keys" },
        { id: "permissions", label: "Permissions" },
        { id: "scope", label: "Application scope" },
        { id: "lists", label: "Lists and pagination" },
        { id: "changes", label: "Creating and changing" },
        { id: "errors", label: "Errors" },
        { id: "limits", label: "Limits" },
        { id: "decisions", label: "Deciding Tickets" },
        {
          id: "endpoints",
          label: "Endpoints",
          children: endpointToc(document),
        },
      ]}
    >
      <DocSection id="overview" title="Requests and authentication">
        <Prose>
          <p>
            Send and receive JSON. Every request carries an API Key in the{" "}
            <Code>Authorization</Code> header. Browser sessions of people signed
            in to Agent 6 are not accepted here, and API Keys are not accepted
            anywhere else.
          </p>
          <p>
            Use HTTPS in production: an API Key is a bearer credential, and
            anyone who sees it can act with its permissions.
          </p>
        </Prose>
        <CodeBlock
          label="Request"
          code={`curl ${base}/applications \\\n  -H "Authorization: Bearer ${EXAMPLE_API_KEY}"`}
        />
        <Prose>
          <p>
            Keys have the form{" "}
            <Code>agent6_&lt;16 hex characters&gt;_&lt;secret&gt;</Code>. The
            first part is the key's visible prefix, shown in Agent 6 so you can
            tell keys apart; the secret is never shown again after the key is
            issued. The key above is a placeholder.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="keys" title="Getting and rotating keys">
        <Prose>
          <ol>
            <li>
              An Admin opens <strong>Service Accounts</strong> in Agent 6 and
              creates a Service Account for the integration.
            </li>
            <li>
              On it, the Admin issues an API Key, choosing its permissions, the
              Applications it may reach and when it expires.
            </li>
            <li>
              Agent 6 shows the key once. Store it in your integration's secret
              store; Agent 6 keeps only a digest and cannot show it again.
            </li>
          </ol>
          <p>
            A new key has no permissions until they are granted. Grant changes,
            revocation, expiry and disabling the Service Account apply to the
            key's next request.
          </p>
          <p>
            To rotate without downtime, issue a second key with the same grants,
            switch the integration to it, check that its last use is recent,
            then revoke the old key. A Service Account may hold several active
            keys at once.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="permissions" title="Permissions">
        <Prose>
          <p>
            Each key holds named permissions, one per resource and operation.
            Write permissions never imply read permissions: a key that may
            update a connection cannot read it without a read permission too.
          </p>
        </Prose>
        <DocTable
          caption="API Key permissions"
          head={["Resource", "Permission", "Allows"]}
        >
          {PERMISSION_GROUPS.flatMap((group) =>
            group.operations.map((operation, index) => (
              <tr key={operation.permission}>
                <td className="w-[1%] whitespace-nowrap">
                  {index === 0 ? group.label : ""}
                </td>
                <td className="w-[1%] whitespace-nowrap">
                  <Code>{operation.permission}</Code>
                </td>
                <td>{operation.description}</td>
              </tr>
            ))
          )}
        </DocTable>
        <Prose>
          <p>
            <Code>tickets:accept</Code> delegates filing on GitHub: accepting a
            Ticket opens an issue, or adds an occurrence comment to an existing
            one, with Agent 6's GitHub token. Grant it only to an integration
            trusted to make that decision.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="scope" title="Application scope">
        <Prose>
          <p>
            A key reaches either <strong>All Applications</strong>, including
            ones created later, or selected Applications. Scope applies to list
            rows, totals, filters, single records and actions alike.
          </p>
          <ul>
            <li>
              A record outside the key's scope answers <Code>404</Code>, the
              same as a record that does not exist, so a key cannot learn which
              IDs exist elsewhere. A filter on an Application outside scope
              matches nothing.
            </li>
            <li>
              A missing permission answers <Code>403</Code>.
            </li>
            <li>
              A Repository, Database Connection or Log Connection is visible to
              a scoped key when it is attached to one of the key's Applications.
              Its <Code>applications</Code> list then shows only the key's
              Applications.
            </li>
            <li>
              Records attached to no Application need All Applications access.
            </li>
            <li>Tags describe purpose and never grant access.</li>
            <li>
              Configuration changes (creating, updating and deleting
              Repositories, Applications, Attachments and connections, and
              setting the Preferred Language) need All Applications access as
              well as their permission; otherwise they answer <Code>403</Code>.
            </li>
            <li>
              Ticket reads and decisions work with selected Applications, so a
              key can review one Application's Tickets only.
            </li>
          </ul>
        </Prose>
      </DocSection>

      <DocSection id="lists" title="Lists and pagination">
        <Prose>
          <p>
            Lists take <Code>page</Code> (from 1) and <Code>pageSize</Code>{" "}
            (default {API_LIMITS.defaultPageSize}, at most{" "}
            {API_LIMITS.maxPageSize}) and answer an envelope. Order is stable:
            configuration records by name, Tickets newest first. Each list's
            filters are listed with its endpoint; Tickets include every status
            unless you filter by one. Unknown query parameters are refused.
          </p>
        </Prose>
        <JsonBlock
          label="A page of Applications"
          value={{
            data: [
              {
                id: "3e8a1f20-5c6b-4d7e-9f80-a1b2c3d4e5f6",
                name: "Billing",
                description: "Invoices and payments",
                notes: "",
                createdAt: "2026-10-02T08:15:00.000Z",
                updatedAt: "2026-11-18T14:40:12.000Z",
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
          }}
        />
      </DocSection>

      <DocSection id="changes" title="Creating and changing">
        <Prose>
          <ul>
            <li>
              Creating answers <Code>201</Code> with a <Code>Location</Code>{" "}
              header naming the new record and a body of only its{" "}
              <Code>id</Code>. Read it with a read permission to see the rest.
            </li>
            <li>
              Updates (<Code>PATCH</Code> with only the fields to change),
              deletes and Ticket decisions answer <Code>204</Code>.
            </li>
            <li>
              Request bodies are strict: an unknown field answers{" "}
              <Code>400</Code> naming it.
            </li>
            <li>
              Connection secrets (<Code>password</Code>, <Code>authSecret</Code>
              ) are write-only. They are encrypted at rest and never appear in
              answers, errors or audit records. Leave one out of an update to
              keep the saved secret; changing a connection's destination or
              account (host, port, database, user or SSL mode; base URL, tenant
              ID or username) needs the secret again.
            </li>
            <li>
              Saving a connection tests it; a failed test still saves, and the
              connection's <Code>status</Code> says how it went.
            </li>
          </ul>
        </Prose>
      </DocSection>

      <DocSection id="errors" title="Errors">
        <Prose>
          <p>
            Every error has the same shape. <Code>code</Code> is stable and
            meant for programs; <Code>message</Code> is for people;{" "}
            <Code>field</Code> names the request field when there is one.
          </p>
        </Prose>
        <JsonBlock
          label="Error"
          value={{
            error: {
              code: "validation_failed",
              message:
                "Field reason: Too small: expected string to have >=1 characters",
              field: "reason",
            },
          }}
        />
        <DocTable caption="Error statuses" head={["Status", "Code", "Meaning"]}>
          {ERROR_CODES.map(({ status, codes }) => (
            <tr key={status} id={`error-${status}`} className="scroll-mt-20">
              <td className="w-[1%] font-mono">{status}</td>
              <td className="w-[1%] whitespace-nowrap">
                {codes.map((code) => (
                  <span key={code} className="block">
                    <Code>{code}</Code>
                  </span>
                ))}
              </td>
              <td>
                {document.components.responses[`Error${status}`]?.description ??
                  "Agent 6 could not finish the request. Try again later."}
              </td>
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection id="limits" title="Limits">
        <Prose>
          <ul>
            <li>
              Each API Key may send a burst of {API_LIMITS.keyBurst} requests,
              then {API_LIMITS.keyPerSecond} per second. Past that the answer is{" "}
              <Code>429</Code> with <Code>Retry-After</Code> in seconds.
            </li>
            <li>
              Repeated requests with an invalid key also answer <Code>429</Code>{" "}
              after {API_LIMITS.authFailureBurst} failures.
            </li>
            <li>
              Request bodies may be at most {API_LIMITS.maxBodyBytes / 1024} KB;
              larger ones answer <Code>413</Code>.
            </li>
          </ul>
        </Prose>
      </DocSection>

      <DocSection id="decisions" title="Deciding Tickets">
        <Prose>
          <p>
            The agent creates Tickets; an Admin, or an integration with the
            right permission, decides them. Agent 6 records which Service
            Account and API Key made each decision. Decided Tickets are final.
          </p>
        </Prose>
        <DocSubsection id="decisions-accept" title="Accept">
          <Prose>
            <p>
              Acceptance files the Ticket exactly as stored and answers{" "}
              <Code>204</Code> once the Filed Issue is recorded. If GitHub
              fails, the answer is <Code>502</Code> and the Ticket stays
              pending.
            </p>
          </Prose>
          <CodeBlock
            label="Accept a Ticket"
            code={`curl -X POST ${base}/tickets/${ticketId}/accept \\\n  ${auth}`}
          />
        </DocSubsection>
        <DocSubsection id="decisions-decline" title="Decline">
          <Prose>
            <p>
              A reason is required. The person who asked for help reads it
              exactly as written, so write it for them.
            </p>
          </Prose>
          <CodeBlock
            label="Decline a Ticket"
            code={`curl -X POST ${base}/tickets/${ticketId}/decline \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"reason": "This invoice is correct: the delivery was a free replacement."}'`}
          />
        </DocSubsection>
        <DocSubsection id="decisions-retry" title="When the result is unclear">
          <Prose>
            <p>
              If a decision times out or the connection drops, read the Ticket
              again before retrying. A <Code>status</Code> other than{" "}
              <Code>pending</Code> means a decision was recorded;{" "}
              <Code>filing: true</Code> means an acceptance is filing the issue
              right now, so wait and read again. A decision on a decided or
              filing Ticket answers <Code>409</Code>.
            </p>
          </Prose>
          <CodeBlock
            label="Read a Ticket"
            code={`curl ${base}/tickets/${ticketId} \\\n  ${auth}`}
          />
          <Prose>
            <p>
              GitHub filing happens before Agent 6 records the acceptance. If
              Agent 6 stops in between, the issue may exist on GitHub while the
              Ticket becomes pending again; check GitHub before accepting a
              second time.{" "}
              <a href="/docs/webhooks" className={linkClass}>
                Webhooks
              </a>{" "}
              tell you about decisions as they happen.
            </p>
          </Prose>
        </DocSubsection>
      </DocSection>

      <EndpointReference document={document} />
    </DocsPage>
  )
}
