# An Admin reviews every Ticket before it reaches GitHub

The planned API extends the reviewer role through explicit Admin delegation. See [ADR 0007](0007-delegate-ticket-decisions.md).

The support agent no longer writes to GitHub. When it locates a Code Fix or Data Fix, it creates a Ticket on the Conversation; an Admin accepts it, optionally after editing the title, body, kind, Repository or target issue, or declines it with a reason the Conversation's owner reads. Only acceptance creates the GitHub issue or the occurrence comment on an existing one. Review is always required: an optional "file directly" setting would keep two reporting paths alive, and occurrence comments go through review too, so nothing the model writes reaches developers without a person deciding.

The trade-off is latency and Admin workload: developers learn of a fault only after review, and every Ticket is work for an Admin. The per-Conversation limit therefore counts every Ticket, whatever its target or outcome. The agent tells the owner that a ticket was created for the team to review, never that the team was informed, and it keeps knowing the Conversation's Tickets and decisions so it does not re-create a declined report without new evidence.

Accepting claims the Ticket with a short lease so two Admins cannot file it twice. If the server stops after GitHub accepted the request but before the result is recorded, the Ticket becomes pending again when the lease expires and a second acceptance can file a duplicate; the Admin sees the issue on GitHub and can decline the Ticket instead.
