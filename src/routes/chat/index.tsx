import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { AppWindowIcon, ClockIcon, MessageSquareIcon } from "lucide-react"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { Composer } from "@/components/chat/composer"
import { DetailPane, PaneHeader, PaneTitle } from "@/components/shell/panes"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  createConversation,
  listChatApplications,
} from "@/server/chat.functions"

export const Route = createFileRoute("/chat/")({
  validateSearch: z.object({ application: z.string().optional() }),
  head: () => ({ meta: [{ title: "New conversation · Agent 6" }] }),
  loader: () => listChatApplications(),
  component: Page,
})

function Page() {
  const applications = Route.useLoaderData()
  const { application: selected } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [error, setError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const ready = applications.some(
    (application) => application.id === selected && application.ready
  )
  return (
    <>
      <ChatSidebar />
      <DetailPane aria-label="New Conversation">
        <PaneHeader>
          <PaneTitle as="h1">New conversation</PaneTitle>
        </PaneHeader>
        <div className="flex min-h-0 flex-1 overflow-y-auto">
          <div className="m-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:px-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">
                Which Application do you need help with?
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose an Application, then tell the agent what you need.
              </p>
            </div>
            {applications.length ? (
              <RadioGroup
                aria-label="Application"
                value={selected ?? ""}
                onValueChange={(value) => {
                  void navigate({
                    search: { application: String(value) },
                    replace: true,
                  })
                }}
                disabled={creating}
              >
                {applications.map((application) => (
                  <FieldLabel
                    key={application.id}
                    className={cn(!application.ready && "border-dashed")}
                  >
                    <Field
                      orientation="horizontal"
                      data-disabled={!application.ready || undefined}
                      className="py-2.5"
                    >
                      <AppWindowIcon
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <FieldContent>
                        <FieldTitle className="text-sm">
                          {application.name}
                        </FieldTitle>
                        {application.description && (
                          <FieldDescription
                            className={cn(
                              selected === application.id &&
                                "text-foreground/70"
                            )}
                          >
                            {application.description}
                          </FieldDescription>
                        )}
                        {!application.ready && (
                          <FieldDescription className="flex items-start gap-1">
                            <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
                            Not ready yet: no Repository is ready to answer
                            questions.
                          </FieldDescription>
                        )}
                      </FieldContent>
                      <RadioGroupItem
                        value={application.id}
                        disabled={!application.ready}
                        aria-label={application.name}
                      />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageSquareIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Applications yet</EmptyTitle>
                  <EmptyDescription>
                    Ask your Admin to add an Application so the agent can help.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Composer
              disabled={!ready || creating}
              hint={ready ? undefined : "Choose an Application first…"}
              onSend={async (message, images) => {
                if (!selected) return false
                setCreating(true)
                setError(undefined)
                try {
                  const result = await createConversation({
                    data: { applicationId: selected, message, images },
                  })
                  if (!result.ok) {
                    setError(result.message)
                    return false
                  }
                  await navigate({
                    to: "/chat/$conversationId",
                    params: { conversationId: result.conversation.id },
                  })
                  return true
                } catch {
                  setError(
                    "The Conversation could not start. Please try again."
                  )
                  return false
                } finally {
                  setCreating(false)
                }
              }}
            />
          </div>
        </div>
      </DetailPane>
    </>
  )
}
