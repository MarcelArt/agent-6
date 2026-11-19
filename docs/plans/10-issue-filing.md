# 10 Issue filing

Read [00-README.md](00-README.md) first.

## Goal

When a problem needs a Code Fix or a Data Fix, the agent files a GitHub issue for developers and tells the user, in plain words, that the team has been informed.

## Depends on

07. Works better after 08 and 09, since evidence then includes data and logs.

## Scope

### Agent tools

- **Find existing issues**: open issues in an attached Repository that Agent 6 filed earlier (found by a label Agent 6 puts on every issue it creates).
- **File issue** in one attached Repository, chosen by the agent as the place the fault lives. For a Data Fix, the Repository that owns the affected data.

### Issue content (written for developers, in English unless the Repository description says otherwise)

- Title.
- Kind: Code Fix or Data Fix.
- What the user experienced, in their words.
- What the agent found: file paths with line numbers at the synced commit, the queries it ran and what they showed, relevant log lines with timestamps.
- Potential fix: a concrete suggestion, as a code sketch or the corrective SQL for a developer to review and run.
- Link back to the Conversation in Agent 6.
- Labels: the Agent 6 label plus `code-fix` or `data-fix`.

### Rules in the agent instructions

- File only after the cause has been located with evidence, not on a guess. If the user simply needs guidance, guide them and file nothing.
- Check for an existing issue first. If one matches, add a comment with the new occurrence and do not file another.
- Redact secrets and personal data (passwords, tokens, emails, phone numbers, names) from the issue body.
- After filing, tell the user the team has been informed and what they can do meanwhile. No issue numbers or technical detail in the message text.

### Storage and UI

- A Filed Issue is saved on the Conversation: Repository, issue number, URL, title, kind, whether it was new or a comment on an existing one.
- The Conversation shows a small "Reported to the team" marker where it happened. Admins see it as a link to GitHub; Clients see it without a link.
- At most a small fixed number of new issues per Conversation, enforced in the tool.

## Out of scope

Tracking issue status after filing. Applying any fix. Admin review before filing.

Step [20 Tickets](20-tickets.md) later added Admin review: the agent now creates a Ticket and an Admin's acceptance files the issue.

## Domain terms

Filed Issue, Code Fix, Data Fix, Repository, Conversation.

## Acceptance checks

- With a deliberately planted bug in a test Repository, describing the symptom in chat produces one issue with all the listed sections and both labels.
- Describing the same symptom in a second Conversation adds a comment to that issue; no second issue appears.
- A "how do I…" question files nothing.
- The tool refuses a Repository not attached to the Conversation's Application (test).
- Without issue permission on the token, the user still gets a helpful answer and the Conversation records that reporting failed, visible to Admins.

## Notes for the agent

- Check the GitHub REST API docs for creating issues, comments, labels and searching issues by label; create the labels if they do not exist.
- The token needs issue write permission; add this to `.env.example` comments.
- Match the Filed Issue notice shown in the chat prototype in `docs/design/`.
