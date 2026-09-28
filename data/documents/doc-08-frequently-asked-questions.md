# Frequently Asked Questions

## Delivery

**Does Loopwire guarantee event ordering?**
No. Events are delivered asynchronously and may arrive out of order at your subscriber, especially during retries. Use the `timestamp` field in the delivery payload if you need to reconstruct order, not arrival order.

**Is delivery exactly-once?**
No. Delivery is at-least-once. If your endpoint processes an event but responds slowly (after 10 seconds) or with a non-2xx status, Loopwire retries, and you'll receive the same `eventId` again. Deduplicate on `Loopwire-Event-Id`.

**How many times will Loopwire try to deliver an event?**
Up to 6 delivery attempts in total: the original attempt plus 5 retries at 1 minute, 5 minutes, 30 minutes, 2 hours, and 12 hours after the first attempt. After that, the delivery is marked `failed`.

**Can I replay old events?**
Yes, any event within the retention window (30 days on Free/Growth, 90 days on Scale) can be manually redelivered to a subscriber from the dashboard's Event Log, or via `POST /v1/events/{eventId}/redeliver`.

**Do redeliveries count toward my quota?**
No. Only the original successful publish counts. Automatic retries and manual redeliveries are free.

**What happens if two subscribers are configured for the same event type?**
Both receive an independent delivery attempt with its own retry schedule. A failure on one subscriber does not affect delivery to the other.

**My endpoint was down for an hour. Did I lose events?**
Probably not. Deliveries that failed during the outage are retried at 1 minute, 5 minutes, 30 minutes, 2 hours, and 12 hours after each event's first attempt. Once your endpoint is back, the 2-hour and 12-hour retries succeed. Check **Failed Deliveries** for anything that used up all 6 attempts and redeliver it.

**What if my subscriber was paused instead of down?**
Events published while a subscriber is paused are not queued. They show as `skipped` and are only delivered if you redeliver them manually.

**Does Loopwire follow redirects?**
No. A `3xx` response counts as a failed delivery. Update the subscriber URL to the final destination.

## Development and testing

**Can I test webhooks without a public URL?**
Yes — use a `lw_test_...` key, which routes events to the built-in test inbox in the dashboard instead of a real HTTPS endpoint, so you can inspect payloads during local development.

To forward test-inbox events to your machine, run `loopwire listen --forward-to http://localhost:3000/webhooks` using the CLI (`npm install -g @loopwire/cli`).

**Do test events count toward my quota?**
No. Events published with `lw_test_...` keys never count against your monthly quota, but they are still subject to rate limits.

**Is there a sandbox for billing?**
No. Plan changes apply to real billing. Use a separate Free project for experiments.

## Limits

**Is there a limit on payload size?**
Yes, 256KB per event payload. Larger payloads are rejected at publish time with `400 Bad Request`.

For bigger data, store it in your own system (or object storage) and send a reference such as an ID or signed URL in the payload.

**What's the maximum length of an event type?**
64 characters, lowercase, dot-separated (`resource.action`), matching `^[a-z0-9_]+(\.[a-z0-9_]+)+$`.

**Can I publish many events in one request?**
Yes. `POST /v1/events/batch` accepts up to 100 events and 1MB total. The batch counts as 1 request toward the rate limit, and each event counts as 1 event toward your quota.

**What counts as one "event" for quota purposes?**
Each successful call to `POST /v1/events` counts once, regardless of how many subscribers ultimately receive it (i.e. one publish to 3 subscribers still counts as 1 event, not 3).

Rejected requests and idempotent replays (same key and same payload within 24 hours) don't count.

## Plans and billing

**How do I downgrade from Scale to Free?**
Request a downgrade from **Billing > Plan**. It takes effect at the start of the next billing cycle; you keep Scale-plan limits until then, including IP allowlisting and 90-day retention.

**What happens when I hit my quota on Free?**
Every publish returns `402 Payment Required` until the cycle resets or you upgrade. Free has no overage option.

**Is there an uptime SLA?**
Growth includes a 99.9% monthly API uptime SLA, and Scale includes 99.95%. Free has no SLA. Live status is at status.loopwire.dev.

**How do I get support?**
Free: the community forum at community.loopwire.dev. Growth: email support@loopwire.dev, with a first response within 1 business day. Scale: 4-hour first response, 24/7, plus a shared Slack channel.

## Security and data

**Where is my data stored?**
In the US region by default. Scale-plan projects can be created in the EU region (`api.eu.loopwire.dev`). A project's region is fixed at creation.

**Is Loopwire compliant with SOC 2 and GDPR?**
Loopwire is SOC 2 Type II certified, and a GDPR DPA is available at loopwire.dev/legal/dpa. Payloads are encrypted at rest (AES-256) and in transit (TLS 1.2+).

**Can I delete an event before the retention window ends?**
Not individually through the dashboard. Payloads are permanently deleted automatically at the end of the retention window: 30 days on Free and Growth, 90 days on Scale.

**Can I restrict which IPs can publish?**
On Scale, yes, under **Project Settings > Network**. Non-allowlisted IPs get `403 Forbidden` even with a valid key.
