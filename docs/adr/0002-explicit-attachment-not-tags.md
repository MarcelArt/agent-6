# Attachments decide scope; Tags never grant access

Repositories, Database Connections and Log Connections all carry Tags, and it would be natural to let an Application pick up every resource that shares one of its Tags. We decided against that: a resource is in scope for an Application only through an explicit Attachment, and a Tag is a hint the agent reads to understand what a resource is for.

The reason is safety. With tag-based linking, a mistyped or reused Tag would silently let the agent query the wrong database or log stream on behalf of a Client. An Attachment is a deliberate act by an Admin and can be listed and audited.

## Consequences

- The agent's tools take the Conversation's Application and resolve resources through Attachments only. No tool accepts a Tag as a way to find a resource.
- A Log Connection's Attachment must carry a Base Selector, because one Loki usually holds logs for many systems.
