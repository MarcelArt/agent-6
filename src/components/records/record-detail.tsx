import { useRender } from "@base-ui/react/use-render"
import { ChevronLeftIcon, CircleAlertIcon } from "lucide-react"
import { cn } from "cn"
import { PaneHeader, PaneTitle } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/*
 * The detail pane of an admin section: header with actions, the form, and
 * the hint shown while nothing is selected. See docs/design/DESIGN.md,
 * section 3.
 */

type LinkElement = React.ReactElement<Record<string, unknown>>

/**
 * Header of a record or create form. `children` come after the title:
 * status Badge, then actions wrapped in `DetailActions`.
 */
export function DetailHeader({
  title,
  backLabel,
  backLink,
  children,
}: {
  title: string
  /** For example "Back to Repositories". Phone only. */
  backLabel?: string
  backLink?: LinkElement
  children?: React.ReactNode
}) {
  const back = useRender({
    render: backLink ?? <span hidden />,
    props: {
      "aria-label": backLabel,
      className: cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "-ml-2 md:hidden"
      ),
      children: <ChevronLeftIcon />,
    },
  })
  return (
    <PaneHeader>
      {backLink && back}
      <PaneTitle as="h1">{title}</PaneTitle>
      {children}
    </PaneHeader>
  )
}

/** Right side of a `DetailHeader`: secondary actions, then the "…" menu. */
export function DetailActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>
  )
}

/** The scrolling form of a detail pane. */
export function RecordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <form
        className={cn(
          "mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10",
          className
        )}
        {...props}
      />
    </div>
  )
}

/** Save first, then Cancel, at the bottom left of a form. */
export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

/** An error that belongs to no single field, at the top of a form. */
export function FormError({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

/** " (optional)" inside a FieldLabel. */
export function Optional() {
  return <span className="font-normal text-muted-foreground">(optional)</span>
}

/** What the detail pane shows while no record is selected, or none exists. */
export function DetailHint({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode
  title?: string
  description: string
  /** The primary button, for example "Connect repository". */
  children?: React.ReactNode
}) {
  return (
    <Empty>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}

/**
 * Asks before an action that takes something away. `description` names what
 * is affected.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
