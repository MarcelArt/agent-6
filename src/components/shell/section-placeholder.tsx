import { DetailPane, ListPane, PaneHeader, PaneTitle } from "./panes"
import type { LucideIcon } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type Hint = { title: string; description: string }

/**
 * A section whose feature comes in a later step: the real panes, headers and
 * empty states, without records or actions.
 */
export function SectionPlaceholder({
  title,
  icon: Icon,
  list,
  detail,
  phone = "list",
}: {
  /** Section name, shown in the list pane header. */
  title: string
  icon: LucideIcon
  /** Empty state of the list pane. Leave out for sections without records. */
  list?: Hint
  /** Hint in the detail pane. */
  detail: Hint
  /** The pane shown at phone width. */
  phone?: "list" | "detail"
}) {
  const phonePane = list ? phone : "detail"
  return (
    <>
      {list && (
        <ListPane
          aria-label={title}
          phone={phonePane === "list" ? "shown" : "hidden"}
        >
          <PaneHeader>
            <PaneTitle>{title}</PaneTitle>
          </PaneHeader>
          <div className="flex flex-1 flex-col p-2 md:flex-none">
            <Empty className="md:border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Icon />
                </EmptyMedia>
                <EmptyTitle>{list.title}</EmptyTitle>
                <EmptyDescription>{list.description}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </ListPane>
      )}
      <DetailPane phone={phonePane === "detail" ? "shown" : "hidden"}>
        {!list && (
          <PaneHeader>
            <PaneTitle as="h1">{title}</PaneTitle>
          </PaneHeader>
        )}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>{detail.title}</EmptyTitle>
            <EmptyDescription>{detail.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DetailPane>
    </>
  )
}
