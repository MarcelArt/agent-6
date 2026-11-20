import { useState } from "react"
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import { CircleAlertIcon, CircleXIcon, TicketsIcon } from "lucide-react"
import { z } from "zod"
import { Markdown } from "@/components/chat/markdown"
import { DetailHeader, DetailHint } from "@/components/records/record-detail"
import { AcceptForm, targetChoice } from "@/components/tickets/accept-form"
import { DeclineDialog } from "@/components/tickets/decline-dialog"
import { TicketStatusBadge } from "@/components/tickets/ticket-status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { activityTime } from "@/lib/conversation-history"
import { issueKindLabels } from "@/lib/chat"
import { ticketStatusLabels } from "@/lib/tickets"
import type { AdminTicket } from "@/lib/tickets"
import { acceptTicket, getTicket } from "@/server/tickets.functions"

export const Route = createFileRoute("/admin/tickets/$ticketId")({
  // The decline dialog is part of the address, like other content dialogs.
  validateSearch: z.object({
    decline: z.boolean().optional().catch(undefined),
  }),
  loader: ({ params }) => getTicket({ data: { ticketId: params.ticketId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? "Ticket"} · Agent 6` }],
  }),
  component: Page,
  notFoundComponent: NotFound,
})

function Page() {
  const ticket = Route.useLoaderData()
  // A fresh form for each Ticket and each change to it.
  return <TicketDetail key={`${ticket.id}:${ticket.status}`} ticket={ticket} />
}

const link = "underline underline-offset-4 hover:text-foreground"

function TicketDetail({ ticket }: { ticket: AdminTicket }) {
  const { decline, ...listSearch } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [target, setTarget] = useState(() =>
    targetChoice(ticket.targetIssueNumber)
  )
  const pending = ticket.status === "pending"
  const duplicateIssue = ticket.possibleDuplicate?.issue
  const facts = (
    <>
      {pending && ticket.filing && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>Another Admin is filing this Ticket</AlertTitle>
          <AlertDescription>
            Reload in a moment to see the result.
          </AlertDescription>
        </Alert>
      )}
      {pending && !ticket.githubConfigured && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Issues cannot be filed</AlertTitle>
          <AlertDescription>
            GITHUB_TOKEN is not set on the server. You can still decline the
            Ticket.
          </AlertDescription>
        </Alert>
      )}
      {pending && ticket.lastError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The last attempt to file it failed</AlertTitle>
          <AlertDescription>{ticket.lastError}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">Requested by</dt>
        <dd className="break-words">
          {ticket.user.name} ({ticket.user.email})
        </dd>
        <dt className="text-muted-foreground">Application</dt>
        <dd>{ticket.application.name}</dd>
        <dt className="text-muted-foreground">Conversation</dt>
        <dd className="break-words">
          <Link
            to="/admin/conversations/$conversationId"
            params={{ conversationId: ticket.conversation.id }}
            className={link}
          >
            {ticket.conversation.title}
          </Link>
          {ticket.conversation.deleted && " (deleted by user)"}
        </dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>
          <time
            suppressHydrationWarning
            dateTime={new Date(ticket.createdAt).toISOString()}
          >
            {activityTime(ticket.createdAt)}
          </time>
        </dd>
        {!pending && (
          <>
            <dt className="text-muted-foreground">Kind</dt>
            <dd>{issueKindLabels[ticket.kind]}</dd>
            <dt className="text-muted-foreground">
              {ticketStatusLabels[ticket.status]} by
            </dt>
            <dd className="break-words">
              {ticket.decidedByServiceAccount ? (
                <>
                  <Link
                    to="/admin/service-accounts/$serviceAccountId"
                    params={{
                      serviceAccountId: ticket.decidedByServiceAccount.id,
                    }}
                    className={link}
                  >
                    {ticket.decidedByServiceAccount.name}
                  </Link>{" "}
                  (Service Account
                  {ticket.decidedByServiceAccount.apiKey &&
                    `, API Key ${ticket.decidedByServiceAccount.apiKey.name}`}
                  )
                </>
              ) : (
                (ticket.decidedBy?.name ?? "A removed user")
              )}
              {ticket.decidedAt !== null && (
                <>
                  {" · "}
                  <time
                    suppressHydrationWarning
                    dateTime={new Date(ticket.decidedAt).toISOString()}
                  >
                    {activityTime(ticket.decidedAt)}
                  </time>
                </>
              )}
            </dd>
          </>
        )}
        {ticket.issue && (
          <>
            <dt className="text-muted-foreground">Filed Issue</dt>
            <dd className="break-words">
              <a
                href={ticket.issue.url}
                target="_blank"
                rel="noreferrer"
                className={link}
              >
                {ticket.issue.outcome === "comment" ? "Occurrence on " : ""}#
                {ticket.issue.number} in {ticket.issue.repository}
              </a>
            </dd>
          </>
        )}
        {ticket.possibleDuplicate && (
          <>
            <dt className="text-muted-foreground">Possible duplicate</dt>
            <dd className="flex flex-col items-start gap-1.5 break-words">
              <span>
                <Link
                  to="/admin/tickets/$ticketId"
                  params={{ ticketId: ticket.possibleDuplicate.id }}
                  search={listSearch}
                  className={link}
                >
                  {ticket.possibleDuplicate.title}
                </Link>{" "}
                · {ticketStatusLabels[ticket.possibleDuplicate.status]}
                {duplicateIssue &&
                  ` · #${duplicateIssue.number} in ${duplicateIssue.repository}`}
              </span>
              {pending &&
                duplicateIssue &&
                duplicateIssue.repository === ticket.repository &&
                !(
                  target.existing &&
                  target.number === String(duplicateIssue.number)
                ) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTarget(targetChoice(duplicateIssue.number))
                    }
                  >
                    Add as an occurrence to #{duplicateIssue.number}
                  </Button>
                )}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Summary for the owner</dt>
        <dd className="break-words">{ticket.summary}</dd>
      </dl>
    </>
  )
  return (
    <>
      <DetailHeader
        title={ticket.title}
        backLabel="Back to All Tickets"
        backLink={<Link to="/admin/tickets" search={listSearch} />}
      >
        <TicketStatusBadge status={ticket.status} />
      </DetailHeader>
      {pending ? (
        <AcceptForm
          ticket={ticket}
          accept={(edits) =>
            acceptTicket({ data: { ticketId: ticket.id, ...edits } })
          }
          onAccepted={() => router.invalidate()}
          target={target}
          onTargetChange={setTarget}
          decline={
            ticket.filing ? (
              <></>
            ) : (
              <Link
                to="."
                search={(previous) => ({ ...previous, decline: true })}
                className={buttonVariants({ variant: "outline" })}
              >
                <CircleXIcon />
                Decline…
              </Link>
            )
          }
        >
          {facts}
        </AcceptForm>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
            {facts}
            {ticket.declineReason !== null && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-medium">
                  Reason given to {ticket.user.name}
                </h2>
                <p className="text-xs break-words whitespace-pre-wrap">
                  {ticket.declineReason}
                </p>
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium">
                {ticket.status === "accepted"
                  ? `Filed in ${ticket.repository}`
                  : `Proposed for ${ticket.repository}`}
              </h2>
              <div className="text-sm/relaxed md:text-xs/relaxed">
                <Markdown variant="document">{ticket.body}</Markdown>
              </div>
            </section>
          </div>
        </div>
      )}
      {decline && pending && (
        <DeclineDialog
          ticketId={ticket.id}
          ownerName={ticket.user.name}
          onClose={() =>
            void navigate({
              to: ".",
              search: (previous) => ({ ...previous, decline: undefined }),
              replace: true,
            })
          }
        />
      )}
    </>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<TicketsIcon />}
      title="Ticket not found"
      description="No Ticket has this address. Pick one from the list."
    />
  )
}
