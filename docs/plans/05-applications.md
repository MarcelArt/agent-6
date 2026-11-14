# 05 Applications

Read [00-README.md](00-README.md) first.

## Goal

An Admin can define Applications and attach Repositories to them. A Repository can belong to several Applications.

## Depends on

04.

## Scope

- `/admin/applications` list, `/admin/applications/new`, `/admin/applications/$applicationId`.
- Fields: name, description for Clients (shown when picking an Application in chat), notes for the agent (what the Application does, who uses it; plain text).
- **Attachments to Repositories**: on the Application page, add and remove Repositories. Many-to-many. Model the Attachment so steps 07 and 08 can attach Database Connections and Log Connections in the same way and place on the page.
- Repository detail page lists the Applications it is attached to.
- Finish the removal check from step 04: removing a Repository names its Applications and removes the Attachments on confirmation.
- Deleting an Application removes its Attachments, not the Repositories.
- A server function `getApplicationScope(applicationId)` returning the Application with its attached resources. It is the only way agent tools learn what is in scope. Tags are returned as hints only.

## Out of scope

Database and Log Connections (07, 08). Restricting which users see which Application: every logged-in user sees all of them.

## Domain terms

Application, Repository, Attachment, Tag.

## Acceptance checks

- One Repository attached to two Applications appears on both and in its own detail page.
- Deleting one of those Applications leaves the Repository and the other Attachment intact.
- Reloading `/admin/applications/$applicationId` shows the same Application.
- A test proves `getApplicationScope` returns only attached Repositories, including when another Repository shares the same Tags. See [ADR 0002](../adr/0002-explicit-attachment-not-tags.md).

## Notes for the agent

- Run `/impeccable` for the screens. The Attachments area will later hold three kinds of resource; design it for that now without building the other two.
