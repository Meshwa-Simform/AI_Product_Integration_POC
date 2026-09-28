# Glossary

Definitions of the terms used throughout the Loopwire documentation, in alphabetical order.

**API key**
A secret credential sent as `Authorization: Bearer <key>` on every API request. Live keys start with `lw_live_` and test keys with `lw_test_`. A project can have up to 5 active keys at once. Only the last 4 characters are shown after the key is created.

**API version**
A date-based version selected with the `Loopwire-Version` header. The current version is `2026-01-15`. If the header is omitted, the project's pinned version is used. Deprecated versions remain supported for 12 months after the deprecation notice.

**At-least-once delivery**
Loopwire's delivery guarantee: every event reaches each matching, active subscriber at least once, but it may arrive more than once. Subscribers must deduplicate.

**Batch publish**
`POST /v1/events/batch`, which sends up to 100 events (1MB body) in one request. It counts as 1 request toward the rate limit, but each event counts toward the quota.

**Billing cycle**
A monthly period that starts on the day you upgraded. The event quota resets on the same day each month.

**Burst**
The short-term number of requests allowed above the sustained rate limit: 20 on Free, 150 on Growth, and 1000 on Scale.

**Delivery**
One subscriber's copy of an event, with an ID of the form `dlv_...`. One event published to 3 subscribers creates 3 deliveries, but it still counts as 1 event.

**Delivery attempt**
A single HTTP POST to a subscriber endpoint. Each delivery gets up to 6 attempts: the original plus retries at 1min, 5min, 30min, 2h, and 12h. The attempt number is sent in `Loopwire-Delivery-Attempt`.

**Delivery status**
One of `pending`, `delivered`, `retrying`, `failed`, or `skipped`.

**Event**
A message you publish with `POST /v1/events`. It has a `type`, a `payload`, and an ID of the form `evt_...`. Each successful publish counts as 1 event toward the monthly quota.

**Event quota**
The number of events allowed per billing cycle: 10,000 on Free and 250,000 on Growth. Scale is unlimited, with events above 2,000,000 billed per additional event. Going over the quota returns `402 Payment Required`, unless Growth overage billing (opt-in, off by default) is enabled.

**Event type**
A dot-separated, lowercase name such as `order.created`, matching `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, with a maximum of 64 characters.

**Failed Deliveries**
The dashboard view that lists deliveries whose 6 attempts all failed. From there they can be redelivered manually.

**Grace period**
The 7 days after a failed payment during which the project keeps working normally. After that the project is suspended.

**Idempotency key**
An optional `idempotencyKey` sent on publish. Repeating it with an identical payload within 24 hours returns the original `eventId`. Repeating it with a different payload returns `409 Conflict`.

**IP allowlisting**
A Scale-plan feature that restricts which source IPs may call `/v1/events`. Requests from other IPs get `403 Forbidden`.

**Manual redelivery**
Re-sending an event to a subscriber from the dashboard or with `POST /v1/events/{eventId}/redeliver`. It resets the retry counter. It is only possible within the retention window, and it does not count as a new event.

**Paused subscriber**
A subscriber that temporarily receives nothing. Events published while it is paused are marked `skipped` and are **not** queued for later.

**Project**
An isolated workspace with its own API keys, subscribers, and event log, with an ID of the form `prj_...`. Plans allow 2 projects (Free), 10 (Growth), or unlimited (Scale).

**Rate limit**
The per-second request limit on `/v1/events`: 10/s on Free, 50/s on Growth, and 500/s on Scale. Going over it returns `429 Too Many Requests` with a `Retry-After` header in seconds.

**Region**
Where a project's data is stored: US by default, or EU (Scale only) at `api.eu.loopwire.dev`. It is chosen when the project is created and cannot be changed afterwards.

**Retention window**
How long event payloads are kept for debugging and redelivery: 30 days on Free and Growth, 90 days on Scale. After that they are permanently deleted.

**Scoped key**
An API key restricted to a single event type, or to read-only access. It is created with `POST /v1/keys` and a `scope` field.

**Signing secret**
A per-subscriber secret starting with `whsec_`, used to compute `Loopwire-Signature`. After a rotation, the old secret stays valid for 24 hours.

**Subscriber**
An HTTPS endpoint that receives deliveries, with an ID of the form `sub_...`. It can be filtered with `eventTypes`. Plans allow 5 subscribers per project (Free), 50 (Growth), or 500 (Scale).

**Suspension**
The state of a project after the payment grace period ends. New publishes are rejected with `403 Forbidden`, but the subscriber configuration is preserved.

**Test inbox**
The dashboard destination for events published with `lw_test_...` keys. Test events never reach real endpoints and never count against the quota.

**Timeout**
The 10 seconds a subscriber has to return a `2xx` response before the attempt is counted as a failure.
