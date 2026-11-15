# 11 Image upload

Read [00-README.md](00-README.md) first.

## Goal

A user can add pictures, usually screenshots, to a message so the agent can see the problem.

## Depends on

07.

## Scope

- In the message box: attach by file picker, paste from clipboard, or drag and drop. Preview with remove before sending. A few images per message.
- Accepted: PNG, JPEG, WebP. Size limit per image. The type is checked from the file content on the server, not from the name or the browser's claim.
- Stored under `DATA_DIR/uploads/`, with a record linked to the message. Large images are downscaled before being sent to the model; the original is kept for display.
- Served through an authenticated route that applies the same rule as the Conversation: owner only (step 14 adds Admins). Not served from a public folder.
- Images are passed to the model as image input together with the message text, and stay part of the Conversation context for follow-ups.
- Agent instructions: read error texts, screen names and field values from the picture and use them to search code and logs.
- If the configured model cannot take images, the user gets a clear message and the text is still answered.
- Images render in the Conversation and open larger on click.
- When a filed issue (step 10, if present) relies on a screenshot, the issue describes what the picture shows in text; the image itself is not uploaded to GitHub.

## Out of scope

Other file types (PDF, video). Image editing or annotation.

## Domain terms

Conversation.

## Acceptance checks

- Paste a screenshot of an error dialog and ask "what does this mean?": the answer refers to the error shown.
- Reload: the image is still in the Conversation.
- Another user requesting the image URL is refused.
- A text file renamed to `.png` is rejected; an oversize image is rejected with a clear message.
- Tests cover type detection, size limit and the access rule.

## Notes for the agent

- Check the OpenAI Agents SDK docs for image input in a user message, including through the Chat Completions path used for compatible servers.
- Check TanStack Start docs for handling file uploads in a server route.
- Match the image attachment shown in the chat prototype in `docs/design/` for attach, preview and display, including on a phone.
