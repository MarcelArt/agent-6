# Admins can delegate Ticket decisions to Service Accounts

Agent 6 keeps the review step introduced in [ADR 0004](0004-admin-review-before-filing.md). An Admin can delegate acceptance or decline through distinct API Key permissions scoped to Applications. An authorized integration can therefore make a decision programmatically, including filing on GitHub through acceptance. The support agent still creates pending Tickets and has no authority to decide them.

The API and Admin UI share the same decision rules and filing path. Record whether the decision came from a human Admin or a Service Account, and which API Key acted. The API uses the stored Ticket for acceptance and requires a reason for decline. This supports external review workflows while making the delegation and responsibility visible in Agent 6.
