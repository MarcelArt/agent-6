# Save Webhook Events with Ticket Changes

Agent 6 records a webhook event in the same database transaction as the Ticket change it describes. Outbound delivery runs in the background and can retry after a restart. A synchronous request would make Ticket actions depend on receiver availability, and sending an event after the database commit would leave a window where a restart could lose it.

A receiver can see the same event more than once if it processes a request but Agent 6 does not record the response. Events can arrive out of order. The stable event ID gives receivers a way to deduplicate delivery. GitHub filing still precedes the local acceptance commit, so an issue created on GitHub immediately before Agent 6 stops may have no recorded event. See [ADR 0004](0004-admin-review-before-filing.md).
