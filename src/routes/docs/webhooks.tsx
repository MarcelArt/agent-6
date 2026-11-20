import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
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
import { SchemaFields } from "@/components/docs/schema-fields"
import type { JsonSchema } from "@/components/docs/schema-fields"
import {
  DOCUMENTED_RETRY_DELAYS,
  EXAMPLE_HEADERS,
  EXPRESS_RECEIVER_CODE,
  OCCURRENCE_EXAMPLE,
  TEST_EVENT_EXAMPLE,
  VERIFY_WEBHOOK_CODE,
  WEBHOOK_EXAMPLES,
} from "@/lib/webhook-docs"
import {
  DELIVERY_RETENTION_DAYS,
  RETRY_WINDOW_HOURS,
  SECRET_OVERLAP_HOURS,
  TIMESTAMP_TOLERANCE_SECONDS,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_TEST_EVENT_TYPE,
  WEBHOOK_TIMEOUT_SECONDS,
  webhookEventDescriptions,
  webhookEventSchema,
} from "@/lib/webhooks"

/** The payload contract, from the schema every event is built with. */
const payloadSchema = z.toJSONSchema(webhookEventSchema, {
  io: "output",
}) as JsonSchema

export const Route = createFileRoute("/docs/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks reference · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <DocsPage
      title="Webhooks reference"
      intro={
        <p>
          Agent 6 can tell another system about Ticket decisions as they happen.
          It sends each event as a signed HTTPS request to the destinations an
          Admin subscribes, and retries until the receiver accepts it.
        </p>
      }
      toc={[
        { id: "setup", label: "Subscribing" },
        { id: "events", label: "Events" },
        { id: "payload", label: "Payload" },
        { id: "examples", label: "Examples" },
        { id: "request", label: "The request" },
        { id: "verify", label: "Verifying signatures" },
        { id: "duplicates", label: "Duplicates and order" },
        { id: "retries", label: "Retries" },
        { id: "rotation", label: "Rotating the secret" },
        { id: "changes", label: "Changing a subscription" },
        { id: "troubleshooting", label: "Troubleshooting" },
      ]}
    >
      <DocSection id="setup" title="Subscribing">
        <Prose>
          <ol>
            <li>
              An Admin opens <strong>Webhooks</strong> in Agent 6 and adds a
              Webhook Subscription with a public HTTPS address.
            </li>
            <li>
              The Admin chooses the events to send and the Applications whose
              Tickets they concern, or All Applications.
            </li>
            <li>
              Agent 6 shows the subscription's signing secret once. Store it
              with the receiver; it starts with <Code>whsec_</Code>.
            </li>
            <li>
              <strong>Send test event</strong> sends a signed{" "}
              <a href="#test-event" className={linkClass}>
                test event
              </a>{" "}
              so you can check the receiver before real events arrive.
            </li>
          </ol>
          <p>
            Events carry the Ticket's developer description: the evidence the
            agent found and its proposed fix. Agent 6 removes what looks like
            email addresses, phone numbers and credentials, but treat the
            receiver as a place that holds internal technical detail. Events
            never include who asked for help, Conversation content, connection
            credentials or internal errors.
          </p>
          <p>
            A subscription's choices of events and Applications are separate
            from any API Key's grants.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="events" title="Events">
        <DocTable caption="Event types" head={["Type", "Sent when"]}>
          {WEBHOOK_EVENT_TYPES.map((type) => (
            <tr key={type}>
              <td className="w-[1%] whitespace-nowrap">
                <Code>{type}</Code>
              </td>
              <td>{webhookEventDescriptions[type]}</td>
            </tr>
          ))}
        </DocTable>
        <Prose>
          <p>
            Events are recorded in the same database transaction as the Ticket
            change, so a committed change always has its event, and an event
            always describes a committed change. A failed GitHub filing leaves
            the Ticket pending and sends nothing.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="payload" title="Payload">
        <Prose>
          <p>
            Every event is a JSON object with the same envelope. Its{" "}
            <Code>data.ticket</Code> is a snapshot taken when the event
            occurred; it does not change on retries, even if the Ticket changes
            later. New fields may be added; a change that could break a receiver
            comes with a new <Code>version</Code>.
          </p>
        </Prose>
        <SchemaFields
          schema={payloadSchema}
          caption="Event payload fields"
          mode="response"
        />
      </DocSection>

      <DocSection id="examples" title="Examples">
        <Prose>
          <p>
            The records below are synthetic. One Ticket is created, then
            accepted with a new GitHub issue; another Ticket about the same
            fault is accepted as an occurrence on that issue.
          </p>
        </Prose>
        {WEBHOOK_EVENT_TYPES.map((type) => (
          <DocSubsection
            key={type}
            id={`example-${type.replaceAll(".", "-")}`}
            title={<Code>{type}</Code>}
          >
            <JsonBlock label={`${type} event`} value={WEBHOOK_EXAMPLES[type]} />
          </DocSubsection>
        ))}
        <DocSubsection id="example-occurrence" title="New issue or occurrence">
          <Prose>
            <p>
              When a Ticket's acceptance opens a new issue,{" "}
              <Code>filedIssue.outcome</Code> is <Code>"new"</Code> and Agent 6
              sends two events: <Code>ticket.accepted</Code> and{" "}
              <Code>github.issue.created</Code>, as above. When the Ticket
              targets an open Agent 6 issue, acceptance adds an occurrence
              comment to it instead: <Code>targetIssue</Code> names the issue,{" "}
              <Code>filedIssue.outcome</Code> is <Code>"comment"</Code>, and
              only <Code>ticket.accepted</Code> is sent.
            </p>
          </Prose>
          <JsonBlock
            label="ticket.accepted for an occurrence comment"
            value={OCCURRENCE_EXAMPLE}
          />
        </DocSubsection>
        <DocSubsection
          id="test-event"
          title={
            <>
              The <Code>{WEBHOOK_TEST_EVENT_TYPE}</Code> event
            </>
          }
        >
          <Prose>
            <p>
              Sent only when an Admin asks for a test. It is signed like any
              other event but is not saved or retried. Answer it with a 2xx
              status and otherwise ignore it.
            </p>
          </Prose>
          <JsonBlock
            label={`${WEBHOOK_TEST_EVENT_TYPE} event`}
            value={TEST_EVENT_EXAMPLE}
          />
        </DocSubsection>
      </DocSection>

      <DocSection id="request" title="The request">
        <Prose>
          <p>
            Each attempt is an HTTPS <Code>POST</Code> of the payload with three
            headers from the{" "}
            <a
              href="https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md"
              className={linkClass}
            >
              Standard Webhooks
            </a>{" "}
            specification, so its libraries can verify these requests too.
          </p>
        </Prose>
        <DocTable caption="Webhook headers" head={["Header", "Value"]}>
          <tr>
            <td className="w-[1%] whitespace-nowrap">
              <Code>webhook-id</Code>
            </td>
            <td>
              The event's <Code>id</Code>. The same on every retry of the event.
            </td>
          </tr>
          <tr>
            <td className="w-[1%] whitespace-nowrap">
              <Code>webhook-timestamp</Code>
            </td>
            <td>
              When this attempt was signed, in whole seconds since 1970 (UTC).
              New for every attempt; it is not when the event occurred.
            </td>
          </tr>
          <tr>
            <td className="w-[1%] whitespace-nowrap">
              <Code>webhook-signature</Code>
            </td>
            <td>
              <Code>v1,</Code> followed by the base64 HMAC-SHA256 signature.
              While a rotated secret overlaps, two signatures separated by a
              space, one per secret.
            </td>
          </tr>
        </DocTable>
        <CodeBlock
          label="Request headers (illustrative)"
          code={EXAMPLE_HEADERS}
        />
      </DocSection>

      <DocSection id="verify" title="Verifying signatures">
        <Prose>
          <ol>
            <li>
              Read the raw request body as received. Parsing and serializing the
              JSON first changes the bytes and breaks the signature.
            </li>
            <li>
              Refuse a <Code>webhook-timestamp</Code> more than{" "}
              {TIMESTAMP_TOLERANCE_SECONDS / 60} minutes from your clock, to
              stop replays.
            </li>
            <li>
              Compute HMAC-SHA256 over{" "}
              <Code>{"<webhook-id>.<webhook-timestamp>.<raw body>"}</Code>,
              keyed with the base64-decoded bytes after <Code>whsec_</Code>.
            </li>
            <li>
              Compare it, in constant time, with each <Code>v1</Code> signature
              in <Code>webhook-signature</Code>. Accept the request if any one
              matches.
            </li>
          </ol>
        </Prose>
        <CodeBlock
          label="verify-webhook.mjs (Node.js)"
          code={VERIFY_WEBHOOK_CODE}
        />
        <CodeBlock label="An Express receiver" code={EXPRESS_RECEIVER_CODE} />
      </DocSection>

      <DocSection id="duplicates" title="Duplicates and order">
        <Prose>
          <p>
            A receiver can get the same event more than once: if it handled a
            request but Agent 6 did not record the answer, for example after a
            timeout or a restart, the event is sent again with the same{" "}
            <Code>webhook-id</Code> and body. Store the IDs you have handled and
            skip repeats.
          </p>
          <p>
            Events can arrive out of order, for example a retried{" "}
            <Code>ticket.created</Code> after <Code>ticket.accepted</Code>. Use{" "}
            <Code>occurredAt</Code> and the Ticket's <Code>status</Code> rather
            than arrival order. If you need the current state, read the Ticket
            through the{" "}
            <a href="/docs/api#getTicket" className={linkClass}>
              API
            </a>
            .
          </p>
        </Prose>
      </DocSection>

      <DocSection id="retries" title="Retries">
        <Prose>
          <ul>
            <li>
              Any 2xx answer counts as delivered. The response body is ignored.
            </li>
            <li>
              Network errors, TLS errors, no answer within{" "}
              {WEBHOOK_TIMEOUT_SECONDS} seconds, <Code>408</Code>,{" "}
              <Code>429</Code> and any <Code>5xx</Code> are retried after{" "}
              {DOCUMENTED_RETRY_DELAYS.join(", ")}, then every{" "}
              {DOCUMENTED_RETRY_DELAYS.at(-1)}, for up to {RETRY_WINDOW_HOURS}{" "}
              hours after the first attempt. Retries continue after Agent 6
              restarts.
            </li>
            <li>
              Other <Code>4xx</Code> answers and redirects fail at once.
              Redirects are never followed: subscribe the final address.
            </li>
            <li>
              Admins see each delivery's status, attempts and last result in
              Agent 6, and can retry a failed delivery. A retry sends the same
              event ID and body.
            </li>
            <li>
              Agent 6 keeps completed delivery history for{" "}
              {DELIVERY_RETENTION_DAYS} days.
            </li>
          </ul>
          <p>
            Answer quickly and do slow work afterwards. A receiver that is down
            never blocks Ticket decisions in Agent 6; events wait for it.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="rotation" title="Rotating the secret">
        <Prose>
          <ul>
            <li>
              <strong>With overlap</strong>, for routine rotation: Agent 6 signs
              with both the new and the old secret for {SECRET_OVERLAP_HOURS}{" "}
              hours. Update the receiver to the new secret within that time; the
              code above accepts either signature.
            </li>
            <li>
              <strong>Immediately</strong>, when the old secret leaked: only the
              new secret signs from then on, and requests the receiver refuses
              meanwhile are retried.
            </li>
          </ul>
          <p>
            Each subscription has its own secret, shown once when it is created
            or rotated.
          </p>
        </Prose>
      </DocSection>

      <DocSection id="changes" title="Changing a subscription">
        <Prose>
          <ul>
            <li>
              Disabling a subscription cancels its deliveries still waiting.
            </li>
            <li>
              Enabling it again starts with new events; events from while it was
              disabled are not sent.
            </li>
            <li>
              Changing its address cancels deliveries still waiting for the old
              address, and they cannot be retried.
            </li>
            <li>
              Narrowing its events or Applications applies to queued deliveries
              too: those it no longer selects are cancelled.
            </li>
            <li>A request already on its way finishes.</li>
          </ul>
        </Prose>
      </DocSection>

      <DocSection id="troubleshooting" title="Troubleshooting">
        <Prose>
          <ul>
            <li>
              <strong>Signature does not match.</strong> Verify the raw body,
              not re-serialized JSON, and use the whole secret including what
              follows <Code>whsec_</Code>. After a rotation, check which secret
              the receiver uses.
            </li>
            <li>
              <strong>Timestamp refused.</strong> Keep the receiver's clock in
              sync with NTP; a drift beyond {TIMESTAMP_TOLERANCE_SECONDS / 60}{" "}
              minutes fails every request.
            </li>
            <li>
              <strong>The address is refused.</strong> Agent 6 sends only to
              public HTTPS addresses. Private, loopback and link-local networks,
              and host names that resolve to them, are refused when saving and
              again before every request.
            </li>
            <li>
              <strong>TLS certificate not accepted.</strong> The receiver needs
              a certificate valid for its host name from a public certificate
              authority.
            </li>
            <li>
              <strong>No answer.</strong> Check that Agent 6's server may reach
              the receiver: outbound HTTPS must be allowed through firewalls and
              proxies. Answer within {WEBHOOK_TIMEOUT_SECONDS} seconds.
            </li>
            <li>
              <strong>A delivery failed.</strong> Its last result in Agent 6
              names the HTTP status or the network problem. Fix the receiver,
              then retry it.
            </li>
          </ul>
        </Prose>
      </DocSection>
    </DocsPage>
  )
}
