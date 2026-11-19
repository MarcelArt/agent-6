# 20 Tickets

Read [00-README.md](00-README.md) first. Design confirmed on 2026-11-19.

## Goal

The agent creates a Ticket instead of filing a GitHub issue. An Admin accepts or declines it; accepting creates the Filed Issue. The Conversation's owner follows the Tickets created from their Conversations.

## Depends on

10, 14 and 19.

## Scope

### Agent

- **Find existing reports** returns open Agent 6 issues and pending Tickets from other Conversations in the Repository.
- **Create Ticket** replaces filing. It stores the developer title and body, the Code Fix, Data Fix or Feature Request kind, the Repository, the target (a new issue, or a new occurrence on an open Agent 6 issue the find call returned), an optional possible duplicate (a pending Ticket the find call returned) and a short non-technical summary for the owner in the Preferred Language. It writes nothing to GitHub.
- A Feature Request is a Ticket for something the Application does not do. The agent confirms that in the code, offers to pass it on, and creates it only when the person asks or agrees; it never tells them to contact the developers themselves. Its sections are what the person asked for, how it works now and a possible approach, and it is filed with the `feature-request` label.
- At most two Tickets per Conversation, counting every target and status.
- The agent receives the Conversation's Tickets with status and decline reason on every reply. After a decline it does not create another Ticket for the same fault without new evidence.
- After creating a Ticket, the agent says a ticket was created for the team to review and can be followed under Tickets. It never says the team was informed or that anything was fixed. For a data correction, it says the data has not been changed.
- Decision AI keeps advising on Repository and kind before a Ticket is created ([ADR 0003](../adr/0003-advisory-decision-ai.md)). Its classes are faults, so for a Feature Request only its Repository advice applies.
- The Guardrail treats feature requests and questions about a Ticket's review or decline as support.

### Admin review

- **All Tickets** (`/admin/tickets`): list with status (pending by default), Application and search filters; a nav badge shows the pending count.
- A pending Ticket can be accepted after editing its title, body, kind, Repository (only those attached to the Conversation's Application) and target. Acceptance re-checks the Attachment, requires an occurrence target to be an open Agent 6 issue, redacts the edited text and files the issue or occurrence comment with both labels and links to the Ticket and Conversation in Agent 6.
- Declining requires a reason. The dialog says the owner reads it exactly as written.
- Accepted and Declined are final. A GitHub failure leaves the Ticket pending with the error shown to Admins.
- A short lease prevents two Admins filing the same Ticket. See [ADR 0004](../adr/0004-admin-review-before-filing.md).

### Owner view

- **Tickets** (`/chat/tickets`): the owner's Tickets with summary, status, decline reason, Application and dates, including Tickets from Conversations they deleted (without a Conversation link).
- In the Conversation, a Ticket marker under the answer that created it shows the status and links to the Ticket. Admins in the audit view get a link to the Admin Ticket and, once accepted, to the Filed Issue.
- Owners never see the developer title, body, kind, Repository, GitHub link or filing errors.

## Out of scope

Email or other notifications outside the app. Reopening a decided Ticket. Owner withdrawal. Tracking the GitHub issue's state after filing. Editing the owner summary. Converting earlier Filed Issues into Tickets.

## Domain terms

Ticket, Filed Issue, Code Fix, Data Fix, Repository, Conversation.

## Acceptance checks

- Describing a planted bug creates one pending Ticket and no GitHub issue; the owner sees "Waiting for review" in the Conversation and on Tickets.
- Accepting with an edited title, kind and Repository files exactly that content, with both labels; the owner sees Accepted and the Conversation counts one Filed Issue.
- Asking for a missing feature gets an offer to pass it on; agreeing creates one Feature Request Ticket, and accepting it files an issue labelled `feature-request`.
- A second Conversation about the same fault targets the existing issue or flags the pending Ticket; accepting it adds a comment, not a new issue.
- Declining requires a reason; the owner sees it verbatim; the agent explains it on the next reply without creating another Ticket.
- Without issue permission, acceptance fails, the Ticket stays pending with the reason visible to Admins, and a later acceptance succeeds.
- Clients cannot call any Admin Ticket function, and never receive developer content.
- Check both Ticket screens in light and dark themes, at desktop and phone widths, with keyboard only.
