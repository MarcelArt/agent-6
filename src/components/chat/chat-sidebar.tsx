import { Link } from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import { ListPane, PaneHeader, PaneTitle } from "@/components/shell/panes"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import type { Conversation } from "@/lib/chat"

/** Only the open Conversation is shown here; browsing history belongs to step 14. */
export function ChatSidebar({ conversation }: { conversation?: Conversation }) {
  return (
    <ListPane phone="hidden" aria-label="Conversations">
      <PaneHeader>
        <PaneTitle>Conversations</PaneTitle>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          render={<Link to="/chat" />}
        >
          New conversation
        </Button>
      </PaneHeader>
      {conversation ? (
        <ul className="min-h-0 overflow-y-auto px-2 py-2">
          <li>
            <Link
              to="/chat/$conversationId"
              params={{ conversationId: conversation.id }}
              aria-current="page"
              className="flex flex-col gap-1 rounded-md bg-muted px-2 py-2 text-xs"
            >
              <span className="truncate font-medium">{conversation.title}</span>
              <span className="truncate text-foreground/70">
                {conversation.application.name}
              </span>
            </Link>
          </li>
        </ul>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>Start a Conversation</EmptyTitle>
            <EmptyDescription>
              Choose an Application and ask for help.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </ListPane>
  )
}
