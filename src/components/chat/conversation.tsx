import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  AppWindowIcon,
  ChevronLeftIcon,
  CircleAlertIcon,
  CircleDotIcon,
} from "lucide-react"
import { ChatSidebar } from "./chat-sidebar"
import { Composer } from "./composer"
import { DetailPane, PaneTitle } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
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
import { getConversation } from "@/server/chat.functions"
import type { ChatEvent, Conversation, ReplyInput, Report } from "@/lib/chat"

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
}: {
  initial: Conversation
  userName: string
}) {
  const [conversation, setConversation] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [networkError, setNetworkError] = useState<string>()
  const sending = useRef(false)
  const mounted = useRef(true)
  const started = useRef(false)
  const id = initial.id
  const last = conversation.messages.at(-1)
  const pending = last?.status === "pending" || last?.status === "queued"
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
    [id, refresh]
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (initial.messages.at(-1)?.status === "queued" && !started.current) {
      started.current = true
      void send({ start: true })
    }
  }, [initial, send])
  useEffect(() => {
    if (!pending || busy) return
    const timer = setInterval(() => {
      void refresh().catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [pending, busy, refresh])
  return (
    <>
      <ChatSidebar conversation={conversation} />
      <DetailPane aria-label="Conversation">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 md:hidden"
            aria-label="New conversation"
            render={<Link to="/chat" />}
          >
            <ChevronLeftIcon />
          </Button>
          <div className="flex min-w-0 flex-col md:flex-1">
            <PaneTitle as="h1">{conversation.title}</PaneTitle>
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
                          <MessageHeader className="gap-1.5 text-xs">
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
                          {message.status === "error" ? (
                            <Alert variant="destructive">
                              <CircleAlertIcon />
                              <AlertDescription className="flex flex-col items-start gap-2">
                                <p>{message.content}</p>
                                {index === conversation.messages.length - 1 && (
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
                          {message.reports.map((report) => (
                            <ReportNotice key={report.id} report={report} />
                          ))}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  </Fragment>
                ))}
                {(pending || busy) && (
                  <Marker role="status">
                    <Spinner aria-hidden="true" />
                    <MarkerContent>Looking at how the app works…</MarkerContent>
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
        <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-3 md:pb-4">
          <Composer
            disabled={pending || busy || last?.status === "error"}
            hint={
              last?.status === "error"
                ? "Retry the answer to continue…"
                : undefined
            }
            onSend={(message) => send({ message })}
          />
        </div>
      </DetailPane>
    </>
  )
}
