# Migrating from Self-Hosted Webhooks

Many teams adopt Loopwire after outgrowing an in-house webhook sender (a queue worker that POSTs to customer URLs). This guide walks through a low-risk migration and highlights behavioral differences that commonly surprise teams.

## What Loopwire replaces

| Self-hosted component | Loopwire equivalent |
|---|---|
| Outbound queue + worker pool | `POST /v1/events` (or `/v1/events/batch`) and managed delivery |
| Retry logic | Automatic retries: 1min, 5min, 30min, 2h, 12h after the first attempt |
| Per-customer endpoint table | Subscribers (`sub_...`) with `eventTypes` filters |
| HMAC signing | `Loopwire-Signature` header, per-subscriber `whsec_...` secret |
| Delivery logs table | Event Log, delivery statuses, Failed Deliveries view |
| Admin "resend" button | Manual redelivery (dashboard or `POST /v1/events/{eventId}/redeliver`) |

## Behavioral differences to plan for

**Timeout.** Subscribers must return `2xx` within 10 seconds. If your old sender waited 30–60 seconds, some customer endpoints will start failing. Tell customers ahead of time.

**Retries.** A failed delivery gets up to 6 attempts in total (the original plus 5 retries) with the last retry 12 hours after the first attempt, then is marked `failed`. If your old system retried for days, failed events now need manual redelivery after that point.

**Ordering.** Loopwire does not guarantee delivery order. If your consumers depended on in-order delivery from a single-threaded worker, they must use the payload `timestamp` or a sequence number in your payload.

**Paused endpoints.** Pausing a subscriber does not buffer events. If your old system queued events for disabled endpoints and flushed them on re-enable, that behavior does not carry over — events published while paused are `skipped`.

**Signature format.** Loopwire signs the raw body with HMAC-SHA256 and sends hex in `Loopwire-Signature`. Your customers' verification code will change; see Signature Verification Code Samples.

**Payload size.** Payloads are limited to 256KB. Large payloads should carry a reference (e.g. a URL or ID) rather than the full document.

**Quota.** Each publish counts as one event regardless of how many subscribers receive it — usually cheaper than a per-delivery model. Check your monthly volume against plan quotas (Free 10,000, Growth 250,000, Scale 2,000,000 included).

## Migration plan

### 1. Model your event types

Map existing webhook names to Loopwire's `resource.action` format (lowercase, dot-separated, matching `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, max 64 characters). For example `OrderCreated` becomes `order.created` and `invoice-paid` becomes `invoice.paid`. If customers depend on the old names, include the legacy name inside your payload during the transition.

### 2. Import subscribers

Write a one-off script that reads your endpoint table and calls `POST /v1/subscribers` for each HTTPS URL. Non-HTTPS URLs are rejected, so identify them first. Record the returned `sub_...` ID and signing secret against each customer, and share the new secret with that customer through your existing secure channel.

Check plan limits before importing: subscribers per project are capped at 5 (Free), 50 (Growth), and 500 (Scale).

### 3. Dual-send (shadow mode)

For one to two weeks, publish every event to Loopwire **and** keep your old sender running, with Loopwire subscribers pointed at your own internal "shadow" endpoints rather than customer URLs. Compare delivery counts, latency (typically within 500ms), and failure rates.

### 4. Cut over per customer

Switch customers in cohorts: update the subscriber URL from your shadow endpoint to the customer's real URL, then disable that customer in the old sender. Use idempotency keys derived from your internal event IDs so a publish that is retried during the cutover isn't duplicated (duplicates within 24 hours with an identical payload return the original `eventId`).

### 5. Decommission

Once all customers are migrated and the old sender's retry queue has drained, shut it down. Keep the old delivery logs for as long as your own retention policy requires — Loopwire only retains payloads for 30 days (Free/Growth) or 90 days (Scale).

## Checklist

- [ ] Event types renamed to `resource.action`
- [ ] All endpoints are HTTPS and respond within 10 seconds
- [ ] Customers informed of new signature header and secret
- [ ] Consumers tolerate out-of-order and duplicate deliveries
- [ ] Publisher handles `402` (quota) separately from `429` (rate limit)
- [ ] Alerting on the Failed Deliveries view
