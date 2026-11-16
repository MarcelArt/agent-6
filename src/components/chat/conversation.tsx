import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  AppWindowIcon,
  ChevronLeftIcon,
  CircleAlertIcon,
  CircleDotIcon,
  ImageIcon,
  ImageOffIcon,
  SquarePenIcon,
} from "lucide-react"
import { ChatSidebar } from "./chat-sidebar"
import { Composer } from "./composer"
import { InteractiveQuestionCard, NO_PICKS } from "./interactive-question"
import { DetailPane, PaneTitle } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { ReplyActivityPanel } from "./reply-activity"
import { getConversation, stopConversationReply } from "@/server/chat.functions"
import { imageUrl } from "@/lib/chat"
import { ENGLISH_AGENT_MESSAGES } from "@/lib/preferred-language"
import { cn } from "@/lib/utils"
import type { ChatEvent, Conversation, ReplyInput, Report } from "@/lib/chat"
import type { ConversationAudit } from "@/lib/conversation-history"
import { AuditActivity } from "./audit-activity"

/** The Filed Issue notice under an agent answer. Only Admins receive `issue` and failures. */
function ReportNotice({ report }: { report: Report }) {
  if (report.outcome === "failed")
    return (
      <Alert variant="destructive" className="w-fit">
        <CircleAlertIcon />
        <AlertTitle>Reporting to the team failed</AlertTitle>
        <AlertDescription>
          {report.reason} ({report.repository})
        </AlertDescription>
      </Alert>
    )
  return (
    <Alert className="w-fit">
      <CircleDotIcon />
      <AlertTitle>Reported to the team</AlertTitle>
      <AlertDescription>
        {report.issue ? (
          <a href={report.issue.url} target="_blank" rel="noreferrer">
            {report.outcome === "comment" ? "Added to " : ""}Filed Issue #
            {report.issue.number} in {report.issue.repository}
          </a>
        ) : (
          "The developers have what they need to fix this."
        )}
      </AlertDescription>
    </Alert>
  )
}

const day = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10)
const time = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
  })

export function ConversationView({
  initial,
  userName,
  openImage,
  audit,
}: {
  initial: Conversation
  userName: string
  /** Id of the picture shown larger, from the URL. */
  openImage?: string
  audit?: ConversationAudit
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const [conversation, setConversation] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [networkError, setNetworkError] = useState<string>()
  // What is ticked on the open Interactive Question; gone once it is sent.
  const [picks, setPicks] = useState(NO_PICKS)
  const composer = useRef<HTMLTextAreaElement>(null)
  const sending = useRef(false)
  const mounted = useRef(true)
  const started = useRef(false)
  const id = initial.id
  // Renames refresh the loader while streamed message state stays local.
  const title = initial.title
  const last = conversation.messages.at(-1)
  const agentMessages = conversation.agentMessages ?? ENGLISH_AGENT_MESSAGES
  const pending = last?.status === "pending" || last?.status === "queued"
  const openQuestion =
    last?.status === "complete" && last.question && !last.question.answer
      ? last.question
      : undefined
  const enlarged = conversation.messages
    .flatMap((message) => message.images)
    .find((image) => image.id === openImage)
  const refresh = useCallback(async () => {
    const latest = await getConversation({ data: { conversationId: id } })
    if (mounted.current) setConversation(latest)
  }, [id])
  const send = useCallback(
    async (input: ReplyInput) => {
      if (sending.current) return false
      sending.current = true
      setBusy(true)
      setNetworkError(undefined)
      try {
        const response = await fetch(`/api/chat/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        if (!response.ok || !response.body) {
          if (response.status === 409) {
            await refresh()
            if ("message" in input) {
              setNetworkError(
                "An answer is already on its way. Send your message again when it finishes."
              )
              return false
            }
            return true
          }
          throw new Error("Request failed")
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = "",
          done = false
        try {
          for (;;) {
            const chunk = await reader.read()
            buffer += decoder.decode(chunk.value, { stream: !chunk.done })
            let newline: number
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline)
              buffer = buffer.slice(newline + 1)
              if (!line) continue
              const event = JSON.parse(line) as ChatEvent
              if (event.type === "done") done = true
              if (!mounted.current) continue
              if (event.type === "snapshot" || event.type === "done")
                setConversation(event.conversation)
              if (event.type === "activity")
                setConversation((current) => ({
                  ...current,
                  messages: current.messages.map((message) => {
                    if (message.id !== event.messageId) return message
                    const activity = [...(message.activity ?? [])]
                    const index = activity.findIndex(
                      (item) => item.id === event.activity.id
                    )
                    if (index < 0) activity.push(event.activity)
                    else activity[index] = event.activity
                    return { ...message, activity }
                  }),
                }))
              if (event.type === "delta")
                setConversation((current) => ({
                  ...current,
                  messages: current.messages.map((message, index) =>
                    index === current.messages.length - 1 &&
                    message.role === "assistant"
                      ? { ...message, content: message.content + event.text }
                      : message
                  ),
                }))
            }
            if (chunk.done) break
          }
        } finally {
          reader.releaseLock()
        }
        if (!done) throw new Error("Reply interrupted")
        setPicks(NO_PICKS)
        void router.invalidate()
        return true
      } catch {
        try {
          await refresh()
        } catch {
          /* Keep messages already visible. */
        }
        if (mounted.current)
          setNetworkError(
            "The connection was interrupted. Your messages are saved. Please try again."
          )
        return false
      } finally {
        sending.current = false
        if (mounted.current) setBusy(false)
      }
    },
    [id, refresh, router]
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (
      !audit &&
      initial.messages.at(-1)?.status === "queued" &&
      !started.current
    ) {
      started.current = true
      void send({ start: true })
    }
  }, [initial, send, audit])
  useEffect(() => {
    if (audit || !pending || busy) return
    const timer = setInterval(() => {
      void refresh().catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [pending, busy, refresh, audit])
  return (
    <>
      {!audit && <ChatSidebar />}
      <DetailPane aria-label="Conversation">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 md:hidden"
            aria-label={audit ? "Back to all Conversations" : "Back to history"}
            render={
              <Link
                to={audit ? "/admin/conversations" : "/chat/history"}
                search={(previous) => ({ ...previous, image: undefined })}
              />
            }
          >
            <ChevronLeftIcon />
          </Button>
          <div className="flex min-w-0 flex-col md:flex-1">
            <PaneTitle as="h1">{title}</PaneTitle>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground md:hidden">
              <AppWindowIcon className="size-3" />
              {conversation.application.name}
            </span>
          </div>
          <Badge
            variant="outline"
            className="hidden max-w-[45%] gap-1 text-xs md:flex"
          >
            <AppWindowIcon />
            <span className="truncate">{conversation.application.name}</span>
          </Badge>
          {audit ? (
            <Badge variant="outline" className="ml-auto text-xs">
              Read-only
            </Badge>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto md:hidden"
              aria-label="New conversation"
              render={<Link to="/chat" />}
            >
              <SquarePenIcon />
            </Button>
          )}
        </header>
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent
                className="mx-auto w-full max-w-2xl gap-5 px-4 py-6"
                aria-label="Messages"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {audit && (
                  <div className="flex flex-col gap-2 text-xs">
                    <p>
                      {audit.user.name} · {audit.user.email}
                    </p>
                    {audit.deletedAt && (
                      <Badge variant="outline" className="text-xs">
                        Deleted by user
                      </Badge>
                    )}
                    <AuditActivity
                      activities={audit.activities.filter(
                        (item) => !item.messageId
                      )}
                    />
                  </div>
                )}
                {conversation.messages.map((message, index) => (
                  <Fragment key={message.id}>
                    {(index === 0 ||
                      day(conversation.messages[index - 1].createdAt) !==
                        day(message.createdAt)) && (
                      <Marker variant="separator">
                        <MarkerContent>
                          {day(message.createdAt) === day(Date.now())
                            ? "Today"
                            : day(message.createdAt)}
                        </MarkerContent>
                      </Marker>
                    )}
                    <MessageScrollerItem messageId={message.id}>
                      <Message
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <MessageContent>
                          <MessageHeader
                            className={cn(
                              "gap-1.5 text-xs",
                              message.role === "assistant" && "px-0"
                            )}
                          >
                            {message.role === "assistant" && (
                              <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-primary text-xs leading-none font-semibold text-primary-foreground">
                                6
                              </span>
                            )}
                            <span className="text-foreground">
                              {message.role === "user" ? userName : "Agent 6"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <time
                              suppressHydrationWarning
                              dateTime={new Date(
                                message.createdAt
                              ).toISOString()}
                            >
                              {time(message.createdAt)}
                            </time>
                          </MessageHeader>
                          {!audit && message.role === "assistant" && (
                            <ReplyActivityPanel
                              message={message}
                              stopping={stopping}
                              onStop={
                                message.status === "pending"
                                  ? () => {
                                      setStopping(true)
                                      void stopConversationReply({
                                        data: { conversationId: id },
                                      })
                                        .then((latest) => {
                                          if (mounted.current)
                                            setConversation(latest)
                                        })
                                        .catch(() => {
                                          if (mounted.current)
                                            setNetworkError(
                                              "Could not stop the investigation. Please try again."
                                            )
                                        })
                                        .finally(() => {
                                          if (mounted.current)
                                            setStopping(false)
                                        })
                                    }
                                  : undefined
                              }
                            />
                          )}
                          {message.status === "error" ? (
                            <Alert variant="destructive">
                              <CircleAlertIcon />
                              <AlertDescription className="flex flex-col items-start gap-2">
                                <p>{message.content}</p>
                                {!audit &&
                                  index ===
                                    conversation.messages.length - 1 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => {
                                        void send({ retry: true })
                                      }}
                                    >
                                      Try again
                                    </Button>
                                  )}
                              </AlertDescription>
                            </Alert>
                          ) : message.question &&
                            message.status === "complete" ? (
                            <InteractiveQuestionCard
                              text={message.content}
                              question={message.question}
                              picks={picks}
                              disabled={!!audit || busy}
                              onPick={setPicks}
                              onSend={(choices) => {
                                void send({ message: "", choices })
                              }}
                              onOther={() => {
                                // The clicked option takes focus first.
                                setTimeout(() => composer.current?.focus())
                              }}
                            />
                          ) : (
                            message.content && (
                              <Bubble
                                variant={
                                  message.role === "user"
                                    ? "secondary"
                                    : "ghost"
                                }
                              >
                                <BubbleContent className="text-sm/relaxed whitespace-pre-wrap">
                                  {message.content}
                                </BubbleContent>
                              </Bubble>
                            )
                          )}
                          {message.images.map((image) => (
                            <Link
                              key={image.id}
                              data-slot="message-image"
                              to={
                                audit
                                  ? "/admin/conversations/$conversationId"
                                  : "/chat/$conversationId"
                              }
                              params={{ conversationId: id }}
                              search={(previous) => ({
                                ...previous,
                                image: image.id,
                              })}
                              className="block w-64 overflow-hidden rounded-lg border bg-card text-left outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-72"
                              aria-label={`Open ${image.name} larger`}
                              title="Open larger"
                            >
                              <img
                                src={imageUrl(image.id)}
                                alt=""
                                width={image.width}
                                height={image.height}
                                className="max-h-72 w-full bg-muted object-cover object-top"
                              />
                              <span className="flex items-center gap-1.5 border-t px-2.5 py-1.5 text-xs">
                                <ImageIcon
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="truncate font-medium">
                                  {image.name}
                                </span>
                              </span>
                            </Link>
                          ))}
                          {message.imagesUnread && (
                            <Alert className="w-fit">
                              <ImageOffIcon />
                              <AlertTitle>
                                The picture could not be viewed
                              </AlertTitle>
                              <AlertDescription>
                                Agent 6 is not set up to look at pictures, so
                                this answer is based on your text only.
                              </AlertDescription>
                            </Alert>
                          )}
                          {message.reports.map((report) => (
                            <ReportNotice key={report.id} report={report} />
                          ))}
                          {audit && message.refused && (
                            <Badge variant="outline" className="text-xs">
                              Refused by Guardrail
                            </Badge>
                          )}
                          {audit && (
                            <AuditActivity
                              activities={audit.activities.filter(
                                (item) => item.messageId === message.id
                              )}
                            />
                          )}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  </Fragment>
                ))}
                {(pending || busy) && last?.role !== "assistant" && (
                  <Marker role="status">
                    <Spinner aria-hidden="true" />
                    <MarkerContent>{agentMessages.progress}</MarkerContent>
                  </Marker>
                )}
                {networkError && (
                  <Alert variant="destructive">
                    <AlertDescription className="flex flex-col items-start gap-2">
                      <p>{networkError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          if (last?.status === "error")
                            void send({ retry: true })
                          else if (last?.status === "queued")
                            void send({ start: true })
                          else {
                            setNetworkError(undefined)
                            void refresh().catch(() =>
                              setNetworkError(
                                "Your Conversation could not be loaded. Please try again."
                              )
                            )
                          }
                        }}
                      >
                        Try again
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
        {!audit && (
          <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-3 md:pb-4">
            <Composer
              disabled={pending || busy || last?.status === "error"}
              inputRef={composer}
              hint={
                last?.status === "error"
                  ? "Retry the answer to continue…"
                  : openQuestion && picks.other
                    ? "Type your answer…"
                    : undefined
              }
              onSend={(message, images) =>
                send({
                  message,
                  images,
                  // Options ticked next to a typed answer are sent with it.
                  ...(openQuestion?.multiple && picks.choices.length
                    ? { choices: picks.choices }
                    : {}),
                })
              }
            />
          </div>
        )}
      </DetailPane>
      <Dialog
        open={!!enlarged}
        onOpenChange={(open) => {
          if (!open)
            void navigate({
              to: audit
                ? "/admin/conversations/$conversationId"
                : "/chat/$conversationId",
              params: { conversationId: id },
              search: (previous) => ({ ...previous, image: undefined }),
              replace: true,
            })
        }}
      >
        {enlarged && (
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="truncate pr-8">
                {enlarged.name}
              </DialogTitle>
            </DialogHeader>
            <img
              src={imageUrl(enlarged.id)}
              alt={`Picture sent in this Conversation: ${enlarged.name}`}
              width={enlarged.width}
              height={enlarged.height}
              className="max-h-[75dvh] w-full rounded-md object-contain"
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
