# 09 Log Connections

Read [00-README.md](00-README.md) first.

## Goal

An Admin can add Loki endpoints and attach them to Applications. The agent can read that Application's logs and no others.

## Depends on

08.

## Scope

### Admin

- `/admin/log-connections` list, new, detail. Fields: name, base URL, optional auth header (basic or bearer), optional tenant ID, Tags, description.
- The base URL is either a Loki server or a Grafana datasource proxy URL that exposes the Loki API. The form explains both with an example of each.
- Auth header value encrypted and never returned to the browser, same rule as passwords in step 08.
- "Test connection": call the labels endpoint and report success or the error.
- **Attach to an Application with a Base Selector**: required, for example `{app="billing"}`. Validate that it is a well-formed selector and show how many streams it currently matches, so the Admin sees a typo as zero.

### Agent tools

Available only for Log Connections attached to the Conversation's Application:

- List label names and values within the Base Selector.
- Query logs: extra label matchers, text or regex line filter, time range, limit.

### Enforcement

- The tool takes structured inputs (matchers, filter, range), not a raw LogQL string, and builds the query itself with the Base Selector's matchers always present. The model cannot remove or override a Base Selector label.
- Default time range of the last hour, a maximum range, a line cap and a per-line length cap; the tool reports when output was cut.
- Request timeout. The auth header never appears in tool output or errors.

### Agent instructions

- Description and Tags of each attached Log Connection.
- Use the time the user mentions; ask when the problem happened if it is unknown and matters.
- Never quote log lines, stack traces or service names to the user.

## Out of scope

Other log backends. Grafana dashboards or alerts. Metrics.

## Domain terms

Log Connection, Attachment, Base Selector, Tag.

## Acceptance checks

- Tests with a fake Loki server: every request carries the Base Selector matchers; an attempt to pass a matcher for a Base Selector label with a different value is refused; caps and timeout hold.
- Attaching with a malformed selector is rejected; a selector matching nothing shows zero streams.
- A Log Connection not attached to the Conversation's Application cannot be queried.
- In chat, "I got an error when saving just now" leads the agent to find the matching error in the logs and explain it plainly.

## Notes for the agent

- Check the Loki HTTP API docs for the labels, label values and range query endpoints, and for the tenant header.
- These screens have no prototype: build them from the list and form pattern in `docs/design/DESIGN.md`, including the Base Selector field with its live match count.
