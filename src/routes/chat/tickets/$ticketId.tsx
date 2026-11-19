import { Link, createFileRoute } from "@tanstack/react-router"
import { MessageSquareIcon, TicketIcon } from "lucide-react"
import { DetailHeader, DetailHint } from "@/components/records/record-detail"
import { TicketStatusBadge } from "@/components/tickets/ticket-status"
import { buttonVariants } from "@/components/ui/button"
import { activityTime } from "@/lib/conversation-history"
import type { TicketStatus } from "@/lib/tickets"
import { getOwnTicket } from "@/server/tickets.functions"

export const Route = createFileRoute("/chat/tickets/$ticketId")({
  loader: ({ params }) => getOwnTicket({ data: { ticketId: params.ticketId } }),
  head: () => ({ meta: [{ title: "Ticket · Agent 6" }] }),
  component: Page,
  notFoundComponent: NotFound,
})

const explanations: Record<TicketStatus, string> = {
  pending:
    "The team will review this ticket before passing it on to the developers.",
  accepted: "The team accepted this ticket and passed it on to the developers.",
  declined: "The team declined this ticket, so it was not passed on.",
}

function Page() {
  const ticket = Route.useLoaderData()
  const search = Route.useSearch()
  const when = (value: number) => (
    <time suppressHydrationWarning dateTime={new Date(value).toISOString()}>
      {activityTime(value)}
    </time>
  )
  return (
    <>
      <DetailHeader
        title={`${ticket.application.name} ticket`}
        backLabel="Back to Tickets"
        backLink={<Link to="/chat/tickets" search={search} />}
      >
        <TicketStatusBadge status={ticket.status} />
      </DetailHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
          <section className="flex flex-col gap-1.5">
            <h2 className="text-xs text-muted-foreground">What it is about</h2>
            <p className="text-sm/relaxed break-words">{ticket.summary}</p>
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="text-xs text-muted-foreground">Where it stands</h2>
            <p className="text-sm/relaxed">{explanations[ticket.status]}</p>
            {ticket.declineReason !== null && (
              <blockquote className="border-l-2 pl-3 text-sm/relaxed break-words whitespace-pre-wrap">
                {ticket.declineReason}
              </blockquote>
            )}
          </section>
          <p className="text-xs text-muted-foreground">
            Created {when(ticket.createdAt)}
            {ticket.decidedAt !== null && (
              <> · Decided {when(ticket.decidedAt)}</>
            )}
          </p>
          {ticket.conversationId ? (
            <Link
              to="/chat/$conversationId"
              params={{ conversationId: ticket.conversationId }}
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              <MessageSquareIcon />
              Open the Conversation
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              You deleted the Conversation this ticket came from.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<TicketIcon />}
      title="Ticket not found"
      description="This ticket is not one of yours, or it does not exist. Pick one from the list."
    />
  )
}
