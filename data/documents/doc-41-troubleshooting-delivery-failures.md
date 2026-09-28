# Troubleshooting Delivery Failures

This guide walks through the most common reasons a Loopwire event does not reach a subscriber endpoint, and how to diagnose each one from the dashboard and API.

## How delivery failure is defined

Loopwire treats a delivery as successful only when your endpoint returns a `2xx` status code within **10 seconds**. Anything else counts as a failure:

- A `3xx` redirect (Loopwire does not follow redirects).
- Any `4xx` or `5xx` response.
- A TCP connection error, DNS failure, or TLS handshake failure.
- No response within the 10-second timeout, even if your server eventually finishes processing.

Every failed attempt is retried on a fixed schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, and 12 hours after the first attempt. That is the original attempt plus 5 retries — **6 delivery attempts in total**. After the final retry fails, the delivery status becomes `failed` and the event appears in **Failed Deliveries**.

## Step 1: Find the delivery

Open **Event Log** in the dashboard and search by `eventId` (`evt_...`). Each event shows one delivery row per subscriber (`dlv_...`) with its current status:

| Status | Meaning |
|---|---|
| `pending` | Queued, first attempt not yet made |
| `delivered` | Endpoint returned 2xx |
| `retrying` | At least one attempt failed, more retries are scheduled |
| `failed` | All 6 attempts failed |
| `skipped` | The subscriber was paused when the event was published |

Click a delivery to see each attempt's timestamp, response status, response time in milliseconds, and the first 1KB of the response body.

## Step 2: Match the symptom

### Status shows `skipped`

The subscriber was paused when the event was published. Events published while a subscriber is paused are **not** queued, and resuming the subscriber does not deliver them. If you need them, redeliver each event manually from the Event Log while it is still within the retention window (30 days on Free/Growth, 90 days on Scale).

### Response time is close to 10,000 ms

Your endpoint is doing too much work before it responds. Loopwire records this as a timeout even if your handler later succeeds, and the retry may cause you to process the event twice. Acknowledge first, then process asynchronously; see Subscriber Endpoint Design.

### Response status `401` or `403` from your endpoint

Your own authentication middleware is rejecting Loopwire. Loopwire deliveries do not carry your app's session cookies or API tokens. Exclude the webhook route from session auth and authenticate it with the `Loopwire-Signature` header instead.

### Response status `400` from your endpoint

This is usually a body-parsing problem. Frameworks that re-serialize JSON before your handler runs also break signature verification, because the HMAC is computed over the **raw** request body. Read the raw bytes, verify the signature, then parse.

### Response status `404` or `405`

The subscriber URL is wrong: a missing path, a trailing slash mismatch, or a route that only accepts `GET`. Deliveries are always `POST` with `Content-Type: application/json`.

### Connection or TLS errors

- The subscriber URL must be HTTPS; plain `http://` URLs are rejected when the subscriber is created.
- Self-signed or expired certificates fail the TLS handshake.
- A firewall may be blocking Loopwire. Allow the delivery IP ranges published at `https://api.loopwire.dev/v1/ips`.

### Status `delivered` but your app never processed it

The endpoint returned 2xx before your background job ran, and the job failed afterwards. Loopwire's responsibility ends at the 2xx. Check your own queue and worker logs, keyed on `Loopwire-Event-Id`.

## Step 3: Redeliver

Once the endpoint is fixed:

- **Single event:** click **Redeliver** on the delivery, or call `POST /v1/events/{eventId}/redeliver`.
- **Bulk:** filter **Failed Deliveries** by subscriber and time range, then select **Redeliver all**.

Manual redelivery resets the retry counter, so a redelivered event gets a fresh set of 6 attempts. Redelivery is only possible while the event payload is still within the retention window. After that the payload has been permanently deleted and cannot be recovered.

## Gotchas

- **Two subscribers, one failing:** each subscriber has an independent retry schedule, so a broken endpoint never delays delivery to a healthy one.
- **Retries and ordering:** a retried event can arrive after newer events. Use the `timestamp` field, not arrival order; see Event Ordering & Deduplication.
- **Test keys:** events published with an `lw_test_...` key go to the dashboard test inbox, never to your real endpoint. If a real endpoint "receives nothing", check which key published the event.
- **Payload rejected at publish time:** if the event never appears in the Event Log at all, the publish itself failed (for example `400` for a payload over 256KB). That is a publish problem, not a delivery problem.

## Checklist

1. Is the event in the Event Log? If not, debug the publish call.
2. Is the delivery status `skipped`? The subscriber was paused.
3. What status code and response time did the last attempt record?
4. Can your endpoint answer with 2xx in well under 10 seconds?
5. Is the webhook route excluded from session auth, and does it verify signatures against the raw body?
6. After fixing, redeliver from **Failed Deliveries** before retention expires.
