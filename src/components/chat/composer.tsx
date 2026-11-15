import { useEffect, useId, useRef, useState } from "react"
import { ArrowUpIcon, CircleAlertIcon, ImageIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import {
  IMAGE_NOT_SUPPORTED,
  IMAGE_TOO_LARGE,
  IMAGE_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat"
import type { ChatImage } from "@/lib/chat"

/** A picture picked for the message being written. */
type Picked = {
  key: string
  name: string
  /** Local preview; the upload id arrives when the server has accepted the file. */
  preview: string
  state: "uploading" | "done" | "error"
  id?: string
  error?: string
}

export function Composer({
  disabled,
  onSend,
  hint,
  inputRef,
}: {
  disabled?: boolean
  onSend: (message: string, images: Array<string>) => Promise<boolean>
  hint?: string
  /** Lets the Conversation move focus here, for "Something else". */
  inputRef?: React.Ref<HTMLTextAreaElement>
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState<Array<Picked>>([])
  const [problem, setProblem] = useState<string>()
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const picker = useRef<HTMLInputElement>(null)
  const latest = useRef(picked)
  latest.current = picked
  useEffect(
    () => () => {
      for (const item of latest.current) URL.revokeObjectURL(item.preview)
    },
    []
  )
  const locked = disabled || sending
  const uploading = picked.some((item) => item.state === "uploading")
  const ready = picked.flatMap((item) => (item.id ? [item.id] : []))
  const canSend = !locked && !uploading && (!!text.trim() || ready.length > 0)

  function change(key: string, next: Partial<Picked>) {
    setPicked((items) =>
      items.map((item) => (item.key === key ? { ...item, ...next } : item))
    )
  }
  async function upload(key: string, file: File) {
    try {
      const body = new FormData()
      body.append("file", file)
      const response = await fetch("/api/uploads", { method: "POST", body })
      if (!response.ok)
        return change(key, { state: "error", error: await response.text() })
      const image = (await response.json()) as ChatImage
      // Removed while it was uploading: drop the stored copy too.
      if (!latest.current.some((item) => item.key === key)) discard(image.id)
      else change(key, { state: "done", id: image.id })
    } catch {
      change(key, {
        state: "error",
        error: "The picture could not be added. Please try again.",
      })
    }
  }
  function discard(imageId: string) {
    void fetch(`/api/uploads/${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    }).catch(() => {})
  }
  function add(files: Array<File>) {
    if (locked || !files.length) return
    setProblem(undefined)
    const room = MAX_IMAGES_PER_MESSAGE - latest.current.length
    if (files.length > room)
      setProblem(
        `You can add up to ${MAX_IMAGES_PER_MESSAGE} pictures to a message.`
      )
    const added: Array<Picked> = []
    for (const file of files.slice(0, Math.max(room, 0))) {
      // Quick feedback only; the server checks the file's real content.
      const error = !(IMAGE_TYPES as ReadonlyArray<string>).includes(file.type)
        ? IMAGE_NOT_SUPPORTED
        : file.size > MAX_IMAGE_BYTES
          ? IMAGE_TOO_LARGE
          : undefined
      const item: Picked = {
        key: crypto.randomUUID(),
        name: file.name || "Picture",
        preview: URL.createObjectURL(file),
        state: error ? "error" : "uploading",
        error,
      }
      added.push(item)
      if (!error) void upload(item.key, file)
    }
    latest.current = [...latest.current, ...added]
    setPicked(latest.current)
  }
  function remove(item: Picked) {
    URL.revokeObjectURL(item.preview)
    if (item.id) discard(item.id)
    latest.current = latest.current.filter((other) => other.key !== item.key)
    setPicked(latest.current)
    setProblem(undefined)
  }
  async function send() {
    if (!canSend) return
    setSending(true)
    try {
      if (await onSend(text.trim(), ready)) {
        setText("")
        setProblem(undefined)
        for (const item of latest.current) URL.revokeObjectURL(item.preview)
        latest.current = []
        setPicked([])
      }
    } finally {
      setSending(false)
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
      onDragOver={(event) => {
        if (locked || !event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(false)
        add([...event.dataTransfer.files])
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id} className="sr-only">
            Message the agent
          </FieldLabel>
          <InputGroup
            className={cn(dragging && "border-ring ring-2 ring-ring/30")}
          >
            {picked.length > 0 && (
              <InputGroupAddon align="block-start">
                <AttachmentGroup
                  className="w-full"
                  role="list"
                  aria-label="Pictures to send"
                >
                  {picked.map((item) => (
                    <Attachment
                      key={item.key}
                      role="listitem"
                      state={item.state}
                      className="max-w-60"
                    >
                      <AttachmentMedia variant="image">
                        {item.state === "error" ? (
                          <CircleAlertIcon />
                        ) : (
                          <img src={item.preview} alt="" />
                        )}
                        {item.state === "uploading" && (
                          <Spinner className="absolute" />
                        )}
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{item.name}</AttachmentTitle>
                        <AttachmentDescription
                          className={cn(
                            item.state === "error" && "whitespace-normal"
                          )}
                          role={item.state === "error" ? "alert" : undefined}
                        >
                          {item.state === "error"
                            ? item.error
                            : item.state === "uploading"
                              ? "Adding…"
                              : "Ready to send"}
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          title="Remove"
                          disabled={sending}
                          onClick={() => remove(item)}
                        >
                          <XIcon />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  ))}
                </AttachmentGroup>
              </InputGroupAddon>
            )}
            <InputGroupTextarea
              id={id}
              ref={inputRef}
              rows={2}
              className="max-h-48 text-sm md:text-sm"
              placeholder={hint ?? "Message the agent…"}
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={locked}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                const files = [...event.clipboardData.files].filter((file) =>
                  file.type.startsWith("image/")
                )
                if (!files.length) return
                event.preventDefault()
                add(files)
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <input
                ref={picker}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                multiple
                hidden
                tabIndex={-1}
                onChange={(event) => {
                  add([...(event.target.files ?? [])])
                  // Picking the same file again must fire a change.
                  event.target.value = ""
                }}
              />
              <InputGroupButton
                size="icon-sm"
                aria-label="Attach image"
                title="Attach image"
                disabled={locked || picked.length >= MAX_IMAGES_PER_MESSAGE}
                onClick={() => picker.current?.click()}
              >
                <ImageIcon />
              </InputGroupButton>
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Send"
                disabled={!canSend}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {problem && <FieldError>{problem}</FieldError>}
        </Field>
      </FieldGroup>
    </form>
  )
}
