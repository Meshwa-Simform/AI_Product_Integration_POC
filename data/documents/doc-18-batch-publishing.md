# Batch Publishing

If you publish events in bursts — for example, a nightly job emitting thousands of `invoice.generated` events — sending them one per request quickly runs into the `/v1/events` rate limit. The batch endpoint lets you publish up to 100 events in a single request.

## POST /v1/events/batch

```
POST /v1/events/batch
Authorization: Bearer lw_live_xxx
Content-Type: application/json

{
  "events": [
    { "type": "invoice.generated", "payload": { "invoiceId": "inv_1" }, "idempotencyKey": "inv_1-gen" },
    { "type": "invoice.generated", "payload": { "invoiceId": "inv_2" }, "idempotencyKey": "inv_2-gen" },
    { "type": "Invoice.Generated", "payload": { "invoiceId": "inv_3" } }
  ]
}
```

**Limits**

- Up to **100 events** per request. More than 100 returns `400 Bad Request` for the whole request.
- Maximum **1MB** total request body. Larger bodies return `400` for the whole request.
- Each individual event payload is still limited to **256KB**.
- An empty `events` array returns `400`.

## Response

If every event is accepted, the response is `202 Accepted` with an `eventId` for each event, in the same order as the request.

If some events are rejected, the response is **`207 Multi-Status`** with a per-event result:

```
207 Multi-Status
{
  "results": [
    { "index": 0, "status": 202, "eventId": "evt_a1" },
    { "index": 1, "status": 202, "eventId": "evt_a2" },
    { "index": 2, "status": 400, "error": { "code": "invalid_event_type", "message": "..." } }
  ]
}
```

Accepted events in a `207` response are published and delivered normally; only the failed entries need to be fixed and resent. Always inspect `results` — treating any `2xx` as full success will silently drop rejected events.

Request-level problems (bad key, suspended project, too many events, body over 1MB, malformed JSON) return a single error status for the entire batch and nothing is published.

## Quota and rate limit accounting

- **Quota**: each accepted event counts as **1 event** toward your monthly quota. A batch of 100 accepted events uses 100 events of quota. Rejected entries don't count.
- **Rate limit**: the whole batch counts as **1 request** toward the `/v1/events` rate limit. On the Free plan (10 requests/second), batching lets you publish up to 1,000 events/second before hitting `429`.

If a batch would take you past your monthly quota, events are accepted in order until the quota is used up; the remaining entries get status `402` in the `207` response. On the Free plan (no overage), everything after the 10,000th event of the month is rejected this way.

## Idempotency in batches

Each event can carry its own `idempotencyKey`, with the same 24-hour rules as single publishes:

- Same key + identical event → the entry returns `202` with the original `eventId` and is not re-counted.
- Same key + different payload → the entry returns `409`.
- Two entries in the *same* batch with the same key → the first is processed, the second is treated as a replay of the first (or `409` if the payloads differ).

This makes whole-batch retries safe: if a batch request times out or returns `429`/`500`, resend the identical batch and every already-accepted event comes back with its original `eventId`.

## Retrying

- `429 Too Many Requests` or `500` for the whole batch → retry the whole batch with exponential backoff, honoring `Retry-After`, up to 5 attempts total.
- `207` with some `400`/`409` entries → fix those entries; don't retry them unchanged.
- `207` with `402` entries → retrying won't help until you upgrade or the billing cycle resets.

## SDK support

The official SDKs expose batching directly, e.g. in Node:

```js
const { results } = await loopwire.events.publishBatch(events);
const rejected = results.filter((r) => r.status >= 400);
```

The SDKs automatically retry `429`/`500` at the request level but never retry individual rejected entries.

## Gotchas

- Events in a batch are routed and delivered independently; there is no ordering guarantee between them, even for the same subscriber.
- Batching doesn't reduce delivery volume — 100 events still produce 100 deliveries per matching subscriber.
- Schema validation (if configured with `enforce`) applies per event; an invalid entry fails with `schema_validation_failed` while the rest succeed.
