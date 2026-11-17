# 19 Decision AI

Design confirmed on 2026-11-17. Implement this step using the decisions below and the shared conventions in [00-README.md](00-README.md).

## Depends on

07–10, 13–15 and 17. Step 18 is optional.

## Goal

Optionally use a separate decision model to help the support agent select investigation resources and classify and route faults without making support depend on that model's availability.

## Agreed scope

- Support TypeSafe System One (Jev), Cloudflare Workers AI (Clef), and the OpenAI Decisions API through provider-specific adapters.
- One active provider per installation, configured entirely through environment variables: provider, credentials, model and endpoint configuration. Credentials are independent of the support model and are never edited in Settings.
- Initially cover Repository selection, Database Connection selection, Log Connection selection, Code Fix/Data Fix classification, and the Repository for a Filed Issue. Keep the interface extensible; replacing the Guardrail or existing duplicate-issue handling is outside this step.
- Recommendations are advisory. The main agent may investigate additional resources attached to the Application and reconsider recommendations based on evidence. Evidence is required before issue filing. See [ADR 0003](../adr/0003-advisory-decision-ai.md).
- Enable Decision AI by default when valid configuration first appears. Persist an organization-wide Admin toggle. Read its effective value for each reply so changes take effect on the next reply.
- When configuration is absent, show Not configured in Settings and disable the toggle. Do not call a decision provider.
- When disabled, unavailable, uncertain, or returning invalid output, continue using the regular agent flow. Do not force an uncertain fix classification.
- Initial selection may receive the question, relevant conversation context and attached-resource metadata. Later decisions may receive bounded, redacted evidence excerpts. Exclude screenshots from Decision AI in this version.
- Preserve existing Attachment boundaries and all tool restrictions. Continue using the regular agent to interpret screenshots, investigate evidence, answer Clients and perform issue operations.
- Automatically select investigation resources after the Guardrail passes on each reply. Request classification and issue destination advice after gathering evidence and before reporting a fault. Allow the main agent to request revised advice when new evidence changes the investigation.
- Resource advice is a ranked selection of all relevant resources, not one resource per kind. Empty and uncertain results are valid. The main agent retains access to every attached resource.
- Classification outcomes are Code Fix, Data Fix, no fix needed, and insufficient evidence. Preserve the existing rule that a located code fault causing incorrect data is a Code Fix whose proposed fix includes the data correction.
- Partial or invalid Decision AI configuration must not prevent application startup. Mark the feature unavailable, show Admins a specific safe configuration error, and continue the regular agent flow.
- Settings shows configuration status, provider/model, the persistent toggle, and an Admin-only Test connection action.
- Conversation review records decision type, selected resources or classification, available confidence scores, duration, and fallback reason. Do not persist raw evidence or provider responses in decision audit records. Clients see ordinary investigation progress.

## Operational limits

- At most four requests per reply, three seconds per request, and six seconds of total waiting for Decision AI. Serialize decision requests, do not retry automatically, and skip further requests after an operational provider failure in that reply. Cancellation aborts the pending decision and the reply.
- Default resource relevance threshold: probability at least 0.7. Classification and destination additionally need a winning margin of at least 0.15. Configure these through DECISION_AI_MIN_PROBABILITY and DECISION_AI_MIN_MARGIN. Use the top option's probability, not the provider's separate confidence field, for thresholds.
- Send the current question, up to six recent text messages, Application and attached-resource metadata, and at most 16 KB of relevant redacted evidence. Limit serialized request input to 64 KB. Never send image content, reasoning or entire SDK tool histories.
- When the full candidate set cannot fit provider count or input limits, skip that decision and continue normally; do not silently remove candidates. Recommendations never shrink the main agent's scope.
- Retain the saved organization-wide toggle across provider changes and configuration removal/restoration. Without a saved preference, valid configuration defaults to enabled.
- Admins may explicitly test the configured provider while the feature is disabled. Tests send synthetic input only and never alter the toggle.

## Acceptance checks

- Each provider uses its dedicated decision protocol and validates answers against the requested questions and allowed values.
- Missing, incomplete or invalid optional configuration never prevents startup or borrows support-model credentials.
- Only Admins can read settings, toggle the feature or run connection tests. No credentials or credential-bearing endpoint reach the browser.
- Disabled and unconfigured runs make no decision requests. An enabled run receives advisory resource rankings after the Guardrail passes; failed decisions still allow ordinary support replies.
- Multiple resources can be selected across Repositories, Database Connections and Log Connections. Empty, uncertain, refused, unknown-target and oversized results fall back without widening or narrowing access.
- Before filing a fault, classification and destination advice is evaluated from the gathered evidence. Conflicting advice is returned to the main agent for review; it may retain an evidence-supported choice. The issue tool still checks Attachments, existing issues and filing limits.
- Cancellation, per-request and total waiting deadlines, request counts, response bounds, redaction and confidence thresholds are tested.
- Conversation review shows normalized decision summaries and safe fallback reasons; Clients see only plain progress messages. Decision evidence and raw provider payloads are excluded from audit summaries.
- Verify Settings in light and dark themes, including configured, disabled, unconfigured, invalid and test-result states; confirm the saved toggle survives reload.
- Run typecheck, lint, tests and the production build.

## Verified provider references

- [TypeSafe System One](https://docs.typesafe.ai/api/system-one): POST /v1/systemone, state and named typed questions.
- [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/): account-scoped Workers AI REST endpoint, state and named typed questions; includes Cloudflare's API envelope.
- [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions): POST /v1/decisions, input and an ordered array of typed questions. The installed OpenAI SDK already includes the Decisions resource.

The provider adapters must normalize their distinct request and response shapes rather than treating these as Chat Completions endpoints.
