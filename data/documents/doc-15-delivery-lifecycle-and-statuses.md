# Delivery Lifecycle & Statuses

A **delivery** is the attempt to get one event to one subscriber. Every published event produces one delivery per matching subscriber, each identified by a `dlv_...` ID and tracked independently.

## Statuses

| Status | Meaning | Terminal? |
|---|---|---|
| `pending` | Created and waiting for its first attempt (usually under 500ms). | No |
| `delivered` | The subscriber responded with a `2xx` within 10 seconds. | Yes |
| `retrying` | At least one attempt failed; another attempt is scheduled. | No |
| `failed` | The original attempt and all 5 retries failed. | Yes (until manually redelivered) |
| `skipped` | The subscriber was paused when the event was published. No attempt is ever made. | Yes |

## State transitions

```
            ┌──────── 2xx ────────► delivered
pending ────┤
            └── non-2xx / timeout ─► retrying ──► (up to 5 retries) ──► delivered
                                                              └──────► failed
paused subscriber at publish time ─────────────────────────────────────► skipped
failed ── manual redeliver ──► pending (retry counter reset)
```

## Attempts and the retry schedule

Each delivery gets up to **6 attempts**: the original attempt plus 5 retries. Retries are scheduled relative to the first attempt:

| Attempt | `Loopwire-Delivery-Attempt` | Sent at (after first attempt) |
|---|---|---|
| 1 (original) | `1` | 0 |
| 2 | `2` | 1 minute |
| 3 | `3` | 5 minutes |
| 4 | `4` | 30 minutes |
| 5 | `5` | 2 hours |
| 6 | `6` | 12 hours |

If attempt 6 fails, the delivery becomes `failed` roughly 12 hours after it was first attempted, and it appears in the **Failed Deliveries** view.

## What counts as success or failure

- **Success**: any `2xx` status code received within **10 seconds** of the request being sent. The response body is ignored.
- **Failure**: any other status (including `3xx` redirects, which are not followed), a connection error, a TLS error, a DNS failure, or no response within 10 seconds.

A `410 Gone` from your endpoint is treated like any other failure — it does not automatically pause or delete the subscriber.

## Request details

Every attempt is an HTTPS `POST` with `Content-Type: application/json` and these headers:

- `Loopwire-Signature` — hex HMAC-SHA256 of the raw body using the subscriber's `whsec_...` signing secret.
- `Loopwire-Event-Id` — the `evt_...` ID, identical across all attempts for the same event.
- `Loopwire-Delivery-Attempt` — `1` to `6`.
- `Loopwire-Timestamp` — unix seconds when this attempt was sent.

Because retries reuse the same `Loopwire-Event-Id`, your endpoint should deduplicate on it — a delivery can succeed on your side but still be retried if your `2xx` response arrived after the 10-second timeout.

## Pausing and deleting mid-lifecycle

- **Pausing** a subscriber holds any deliveries currently `retrying`; their schedule continues after the subscriber is resumed. New events published while paused get `skipped` deliveries.
- **Deleting** a subscriber cancels its `pending` and `retrying` deliveries. They are not marked `failed`.
- **Revoking the API key** that published an event does not affect its deliveries — anything already accepted with `202` is still delivered.

## Checking delivery status

- Dashboard: the event detail page in the Event Log.
- API: `GET /v1/events/{eventId}/deliveries` returns `status`, `attempts`, `lastResponseStatus`, `lastAttemptAt` and `nextAttemptAt` (when `retrying`) for each delivery.

## Ordering

Deliveries are independent and concurrent, so ordering is not guaranteed — especially when retries are involved. Use the event's `timestamp` field, not arrival order, if your consumer needs to reconstruct sequence.
