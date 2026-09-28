# Webhooks Overview

A "webhook" in Loopwire is a subscriber endpoint that receives HTTP POST deliveries for events you publish.

## Creating a subscriber

`POST /v1/subscribers` with `url` (must be HTTPS) and optional `eventTypes` (an array to filter which events this subscriber receives; omit to receive all event types). Each subscriber gets its own signing secret for verifying deliveries (see Security Best Practices).

```
POST /v1/subscribers
Authorization: Bearer lw_live_xxx
{
  "url": "https://example.com/webhooks/loopwire",
  "eventTypes": ["order.created", "order.shipped"],
  "description": "Fulfillment service"
}
```

Response:

```
{
  "id": "sub_9f2k1",
  "url": "https://example.com/webhooks/loopwire",
  "eventTypes": ["order.created", "order.shipped"],
  "status": "active",
  "signingSecret": "whsec_..."
}
```

Limits and rules:

- Subscribers per project: 5 on Free, 50 on Growth, 500 on Scale.
- `http://` URLs, private IP addresses, and `localhost` are rejected with `400 Bad Request`. Use the CLI's `loopwire listen` command for local testing.
- Filters match exact event type names. To receive all events, omit `eventTypes` or send an empty array.
- You can update a subscriber's URL or filters with `PATCH /v1/subscribers/{id}`. The signing secret doesn't change when you update the URL.
- Changes apply only to events published after the change. Deliveries already queued keep the old settings.

## Delivery format

Each delivery is a POST with `Content-Type: application/json` and a body:

```
{
  "eventId": "evt_abc123",
  "type": "order.created",
  "payload": { ... },
  "timestamp": "2026-01-15T10:00:00Z"
}
```

`timestamp` is when the event was published, not when this delivery attempt was sent. It is the same on every retry.

Each delivery also carries these headers:

| Header | Example | Meaning |
|---|---|---|
| `Loopwire-Signature` | `9c1e...` | Hex HMAC-SHA256 of the raw body |
| `Loopwire-Event-Id` | `evt_abc123` | Same on every attempt; use it for deduplication |
| `Loopwire-Delivery-Attempt` | `3` | 1 for the original attempt, up to 6 for the last retry |
| `Loopwire-Timestamp` | `1768471200` | Unix seconds when this attempt was sent |

Your endpoint must respond with a `2xx` status within 10 seconds to acknowledge receipt. Any other response is treated as a delivery failure and queued for retry.

The response body is ignored. Redirects (`3xx`) are failures, because Loopwire doesn't follow them.

## Retry schedule

Failed deliveries are retried 5 times after the original attempt (6 delivery attempts in total), with increasing delay: 1 minute, 5 minutes, 30 minutes, 2 hours, then 12 hours after the first attempt. If all 6 attempts fail, the event is marked `failed` and can be manually redelivered from the dashboard, which resets the retry counter.

### Worked example

The original attempt fails at 09:00.

| Attempt | Time | Status while waiting |
|---|---|---|
| 1 (original) | 09:00 | `retrying` |
| 2 | 09:01 | `retrying` |
| 3 | 09:05 | `retrying` |
| 4 | 09:30 | `retrying` |
| 5 | 11:00 | `retrying` |
| 6 | 21:00 | `failed` if this one fails too |

At 09:40, 40 minutes after the first attempt, the original plus the 1-minute, 5-minute, and 30-minute retries have run (4 delivery attempts). The 2-hour and 12-hour retries (2 attempts) remain. If any attempt succeeds, the delivery becomes `delivered` and no further retries happen.

### Delivery statuses

- `pending` — queued, first attempt not yet made.
- `delivered` — an attempt received `2xx`.
- `retrying` — at least one attempt failed and more retries are scheduled.
- `failed` — all 6 attempts failed. Eligible for manual redelivery.
- `skipped` — the subscriber was paused when the event was published, so no attempt was made.

### Manual redelivery

Redeliver from **Failed Deliveries** in the dashboard or with `POST /v1/events/{eventId}/redeliver`. A redelivery starts a fresh schedule: a new original attempt followed by up to 5 retries. Redelivery works only while the event is within the retention window (30 days Free/Growth, 90 days Scale), and it doesn't count toward your quota.

## Pausing a subscriber

You can pause a subscriber from the dashboard without deleting it. Paused subscribers do not receive new deliveries, but events published while paused are *not* queued for later — only events published after the subscriber is resumed will be delivered.

Events published during the pause appear in the Event Log with delivery status `skipped` for that subscriber. If you need them, redeliver them manually after resuming (within the retention window).

Deliveries that were already `retrying` when you paused are held, not cancelled. Their retry schedule continues after the subscriber is resumed.

## Handler best practices

- **Acknowledge fast.** Verify the signature, store the event, return `200`, then process asynchronously. The 10-second timeout includes TLS setup and your processing time.
- **Be idempotent.** Retries and manual redeliveries reuse the same `eventId`. Record processed IDs and skip duplicates.
- **Don't rely on order.** Retries can deliver an older event after a newer one. Compare `timestamp` values or re-fetch the current state from your own system.
- **Monitor failures.** Watch the Failed Deliveries view, or alert on a rising `Loopwire-Delivery-Attempt` in your logs. Values of 3 or higher mean earlier attempts failed.

## Deleting a subscriber

`DELETE /v1/subscribers/{id}` removes the endpoint and cancels all of its pending and retrying deliveries. This can't be undone, and the signing secret is invalidated. Pause instead if you might need the endpoint again.
