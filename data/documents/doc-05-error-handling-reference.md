# Error Handling Reference

All Loopwire API errors return a JSON body: `{ "error": { "code": "...", "message": "..." } }`.

```
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "idempotency_conflict",
    "message": "idempotencyKey 'ord_123-created' was already used with a different payload."
  }
}
```

The `code` field is stable and meant for your code to branch on. The `message` is for humans and may change. Every response, including errors, carries a `Loopwire-Request-Id` header. Include it when you contact support.

## HTTP status codes

- `400 Bad Request` — malformed JSON or missing required field (`type` or `payload`).
- `401 Unauthorized` — missing, invalid, or revoked API key.
- `402 Payment Required` — monthly event quota exceeded.
- `403 Forbidden` — project suspended (failed payment) or key lacks scope for this action.
- `404 Not Found` — subscriber or event ID does not exist.
- `409 Conflict` — duplicate `idempotencyKey` with a different payload than the original request.
- `429 Too Many Requests` — rate limit exceeded; see `Retry-After` header.
- `500 Internal Server Error` — Loopwire-side failure; safe to retry with backoff.

### Error codes

| Status | `code` | Typical cause |
|---|---|---|
| 400 | `invalid_json` | Body is not valid JSON |
| 400 | `missing_field` | `type` or `payload` is absent |
| 400 | `invalid_event_type` | Type doesn't match `^[a-z0-9_]+(\.[a-z0-9_]+)+$` or is longer than 64 characters |
| 400 | `payload_too_large` | Payload is over 256KB |
| 401 | `invalid_api_key` | Key is missing, malformed, unknown, or revoked |
| 402 | `quota_exceeded` | Monthly event quota is used up |
| 403 | `project_suspended` | Payment failed and the 7-day grace period ended |
| 403 | `insufficient_scope` | Key is scoped to another event type or is read-only |
| 403 | `ip_not_allowed` | Scale-plan IP allowlist blocked the source IP |
| 404 | `not_found` | Unknown `evt_`, `sub_`, or `dlv_` ID |
| 409 | `idempotency_conflict` | Same `idempotencyKey`, different payload |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Loopwire-side failure |

## Which errors to retry

| Status | Retry? | What to do |
|---|---|---|
| 400 | No | Fix the request. Retrying the same body always fails. |
| 401 | No | Check or rotate the key. |
| 402 | No | Upgrade the plan, enable overage, or wait for the cycle reset. |
| 403 | No | Fix the scope or IP, or pay the open invoice. |
| 404 | No | Check the ID. |
| 409 | No | Use a new idempotency key for a genuinely new event. |
| 429 | Yes | Wait `Retry-After`, then back off exponentially. |
| 500 | Yes | Back off exponentially. |
| Network error or timeout | Yes | Retry with the **same** `idempotencyKey` to avoid duplicates. |

Publisher retries should use exponential backoff with a maximum of 5 attempts in total. If a `429` is followed by a `500`, keep backing off. Both count toward the same 5-attempt budget, and the delay keeps doubling.

## Idempotency

Publishing supports an optional `idempotencyKey` field. If you send the same key twice with an identical payload within 24 hours, the second request returns the original `eventId` without re-publishing. Sending the same key with a *different* payload returns `409 Conflict`.

```
POST /v1/events
{
  "type": "order.created",
  "idempotencyKey": "ord_123-created",
  "payload": { "orderId": "ord_123", "amount": 4200 }
}
```

Notes:

- Keys are scoped per project, up to 255 characters.
- Derive the key from your own data (such as order ID plus event type), not a random value generated per attempt. Otherwise retries after a timeout create duplicates.
- A replay within 24 hours doesn't count toward your quota again.
- After 24 hours the key is forgotten, so reusing it publishes a new event.
- A request rejected with `4xx` doesn't record the key. You can fix the request and reuse the same key.

## Subscriber delivery errors

If a subscriber endpoint returns a non-2xx response or times out (10s timeout), Loopwire retries delivery using exponential backoff: 1min, 5min, 30min, 2h, 12h — 5 retries after the original attempt, 6 delivery attempts in total. After the last retry (the 6th delivery attempt) fails, the event is marked `failed` and appears in the dashboard's **Failed Deliveries** view, where you can manually redeliver it.

The retry delays are measured from the first attempt:

| Attempt | `Loopwire-Delivery-Attempt` | Time after first attempt |
|---|---|---|
| Original | 1 | 0 |
| Retry 1 | 2 | 1 min |
| Retry 2 | 3 | 5 min |
| Retry 3 | 4 | 30 min |
| Retry 4 | 5 | 2 h |
| Retry 5 | 6 | 12 h |

What counts as a delivery failure:

- Any non-2xx status, including `3xx` redirects. Loopwire doesn't follow redirects.
- No response within 10 seconds.
- TLS handshake failure or an invalid certificate.
- Connection refused or a DNS resolution failure.

`2xx` responses are successes regardless of the body. Return `2xx` as soon as you have safely stored the event, then process it asynchronously.

## Client example

```js
try {
  await loopwire.events.publish({ type: 'order.created', payload, idempotencyKey: `${order.id}-created` });
} catch (err) {
  switch (err.status) {
    case 402: alertOps('Loopwire quota exceeded'); break;
    case 403: if (err.code === 'project_suspended') alertBilling(); break;
    case 409: log.warn('Idempotency conflict', err.message); break;
    default: throw err; // SDK already retried 429/500 up to 5 attempts
  }
}
```
