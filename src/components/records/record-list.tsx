import { useEffect, useRef, useState } from "react"
import { useRender } from "@base-ui/react/use-render"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { cn } from "cn"
import { PaneHeader, PaneTitle } from "@/components/shell/panes"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

/*
 * The list pane of an admin section: header, search, rows, pagination and
 * empty state. See docs/design/DESIGN.md, section 3.
 *
 * Links are passed in as elements (`<Link to="…" />`), so each route keeps
 * its typed addresses and these components add the looks.
 */

type LinkElement = React.ReactElement<Record<string, unknown>>

/**
 * Section name, record count and the "+" link to the create form. `actions`
 * (`RecordListAction`s) sit before the "+".
 */
export function RecordListHeader({
  title,
  count,
  addLabel,
  addLink,
  actions,
}: {
  title: string
  count?: number
  /** For example "Connect repository". */
  addLabel: string
  addLink: LinkElement
  actions?: React.ReactNode
}) {
  const add = useRender({
    render: addLink,
    props: {
      "aria-label": addLabel,
      title: addLabel,
      className: buttonVariants({ variant: "ghost", size: "icon-sm" }),
      children: <PlusIcon />,
    },
  })
  return (
    <PaneHeader>
      <PaneTitle>{title}</PaneTitle>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      <div className="ml-auto flex items-center">
        {actions}
        {add}
      </div>
    </PaneHeader>
  )
}

/** A ghost icon link in a list header, named for screen readers and on hover. */
export function RecordListAction({
  label,
  link,
  children,
}: {
  label: string
  link: LinkElement
  /** The icon. */
  children: React.ReactNode
}) {
  return useRender({
    render: link,
    props: {
      "aria-label": label,
      title: label,
      className: buttonVariants({ variant: "ghost", size: "icon-sm" }),
      children,
    },
  })
}

/** The row under the header that holds the search and any filter. */
export function RecordListToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 px-2 py-2">{children}</div>
}

/**
 * Search field of a list. `value` is what the address says; `onSearch` is
 * called shortly after the person stops typing.
 */
export function RecordSearch({
  value,
  onSearch,
  label,
}: {
  value: string
  onSearch: (value: string) => void
  /** Placeholder and accessible name, for example "Search users". */
  label: string
}) {
  const [text, setText] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Follow the address (Back, a link) unless the person is typing.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <InputGroup className="flex-1">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={input}
        type="search"
        placeholder={label}
        aria-label={label}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => onSearch(next.trim()), 250)
        }}
      />
    </InputGroup>
  )
}

export function RecordList({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <ul aria-label={label} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {children}
    </ul>
  )
}

/**
 * One record: a status icon and two lines. Line 1 is the name with one key
 * property on the right; line 2 is muted, with a secondary property on the
 * right.
 */
export function RecordRow({
  link,
  selected,
  icon,
  name,
  property,
  detail,
  detailLines = 1,
  secondary,
}: {
  link: LinkElement
  selected: boolean
  /** Status icon, `size-3.5`. */
  icon: React.ReactNode
  name: React.ReactNode
  property?: React.ReactNode
  detail: React.ReactNode
  /** 2 wraps an error once; 4 leaves room for audit status badges. */
  detailLines?: 1 | 2 | 4
  secondary?: React.ReactNode
}) {
  // On a selected row, muted text would fall below 4.5:1 in light theme.
  const muted = selected ? "text-foreground/70" : "text-muted-foreground"
  const row = useRender({
    render: link,
    props: {
      "aria-current": selected ? "page" : undefined,
      className: cn(
        "flex items-start gap-2.5 rounded-md px-2 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:py-1.5",
        selected ? "bg-muted" : "hover:bg-muted/50"
      ),
      children: (
        <>
          <span className="flex h-5 items-center [&_svg]:size-3.5">{icon}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 leading-5">
              <span className="truncate text-xs font-medium">{name}</span>
              {property && (
                <span
                  className={cn(
                    "ml-auto flex shrink-0 items-center gap-1 text-xs [&_svg]:size-3",
                    muted
                  )}
                >
                  {property}
                </span>
              )}
            </span>
            <span className="flex items-start gap-2 text-xs leading-4">
              <span
                className={cn(
                  "min-w-0",
                  detailLines === 4
                    ? "line-clamp-4"
                    : detailLines === 2
                      ? "line-clamp-2"
                      : "truncate",
                  muted
                )}
              >
                {detail}
              </span>
              {secondary && (
                <span
                  className={cn(
                    "ml-auto flex shrink-0 items-center gap-1 [&_svg]:size-3",
                    muted
                  )}
                >
                  {secondary}
                </span>
              )}
            </span>
          </span>
        </>
      ),
    },
  })
  return <li>{row}</li>
}

/** Empty state of the list pane: no records yet, or none match the search. */
export function RecordListEmpty({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  /** Shown at phone width only; on desktop the detail pane has the button. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col p-2 md:flex-none">
      <Empty className="md:border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {children && (
          <EmptyContent className="md:hidden">{children}</EmptyContent>
        )}
      </Empty>
    </div>
  )
}

/**
 * "21–40 of 43" with previous and next links. Renders nothing when
 * everything fits on one page.
 */
export function RecordPagination({
  page,
  pageSize,
  total,
  pageLink,
}: {
  page: number
  pageSize: number
  total: number
  /** The link to a page, for example `<Link to="." search={…} />`. */
  pageLink: (page: number) => LinkElement
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  if (lastPage <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav
      aria-label="Pages"
      className="flex h-10 shrink-0 items-center gap-1 border-t px-4 text-xs text-muted-foreground"
    >
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <PageLink
          label="Previous page"
          link={page > 1 ? pageLink(page - 1) : undefined}
        >
          <ChevronLeftIcon />
        </PageLink>
        <PageLink
          label="Next page"
          link={page < lastPage ? pageLink(page + 1) : undefined}
        >
          <ChevronRightIcon />
        </PageLink>
      </span>
    </nav>
  )
}

function PageLink({
  label,
  link,
  children,
}: {
  label: string
  /** Left out when there is no such page. */
  link?: LinkElement
  children: React.ReactNode
}) {
  const className = buttonVariants({ variant: "ghost", size: "icon-sm" })
  return useRender({
    render: link ?? <span role="link" aria-disabled="true" />,
    props: {
      "aria-label": label,
      title: label,
      className: cn(className, !link && "opacity-50"),
      children,
    },
  })
}
