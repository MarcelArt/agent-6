import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

const remarkPlugins = [remarkGfm]

// Answers can quote untrusted evidence. A remote image would load as soon as
// the message renders, so a planted URL could carry data out; leave them out.
const disallowedElements = ["img"]

const components: Components = {
  a({ node: _node, ...props }) {
    return <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
  },
  table({ node: _node, ...props }) {
    return (
      <div data-slot="markdown-table">
        <table {...props} />
      </div>
    )
  },
}

// Styles live under `[data-slot="markdown"]` in styles.css. `document` rules
// off section headings for longer reports, such as a filed Ticket body.
function Markdown({
  children,
  variant,
}: {
  children: string
  variant?: "document"
}) {
  return (
    <div data-slot="markdown" data-variant={variant}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        disallowedElements={disallowedElements}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export { Markdown }
