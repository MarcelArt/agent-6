# 14 Conversation history

Read [00-README.md](00-README.md) first.

## Goal

Users can find and continue their past Conversations. Admins can review every Conversation to see what the agent said and did.

## Depends on

07. Shows more after 10 (Filed Issues) and 11 (images).

## Scope

### For every user

- A list of the user's own Conversations in the chat area: title, Application, last activity, newest first, loading more as needed. Filter by Application and search by title, both in search params.
- Opening one goes to `/chat/$conversationId`; the user can keep chatting in it.
- Rename and delete own Conversations. Deleting hides it from the user; the record stays for Admin audit.
- "New conversation" from anywhere in the chat area.

### For Admins

- `/admin/conversations`: all Conversations with user, Application, last activity, number of Filed Issues, and whether any message was refused by the Guardrail. Filter by user, Application, "has Filed Issue"; search params hold the filters.
- `/admin/conversations/$conversationId`: read-only view. Admins cannot send messages in someone else's Conversation.
- The Admin view also shows what Clients do not see: which tools ran with their inputs (SQL, log queries, files read), Filed Issue links, and errors. Secrets stay hidden.
- Images in a Conversation are viewable by its owner and by Admins (extends the rule from step 11).
- Deleted-by-user Conversations appear in the Admin list, marked as such.

## Out of scope

Export. Retention or automatic deletion. Analytics.

## Domain terms

Conversation, Filed Issue, Guardrail, Admin, Client.

## Acceptance checks

- A user sees only their own Conversations; another user's Conversation URL is refused.
- An Admin opens a Client's Conversation, sees the tool activity, and has no message box.
- A Client cannot open any `/admin/conversations` URL.
- Reloading a filtered list keeps the filters.
- A Conversation deleted by its owner is gone from their list and still visible to Admins.
- Tests cover the access rules for both views and for images.

## Notes for the agent

- Tool activity must already be stored by step 07's run persistence; if a needed detail is missing, extend what is saved going forward and show older Conversations without it.
- Match the Conversation history screen of the prototype in `docs/design/`; it must work on a phone. The Admin audit view has no prototype: build it from the list pattern in `docs/design/DESIGN.md`.
