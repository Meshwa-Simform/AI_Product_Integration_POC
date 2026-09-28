# Idempotency Guide

Idempotency lets you retry a publish request safely without creating duplicate events. This guide explains how Loopwire's `idempotencyKey` works and how to use it correctly.

## Why you need it

Networks fail in ambiguous ways. If your publish request times out, you cannot tell whether:

- Loopwire never received it, or
- Loopwire accepted it (`202`) and the response was lost on the way back.

Without idempotency, a retry in the second case publishes the event twice. Every subscriber then receives two deliveries, and the duplicate counts against your monthly quota.

## How it works

Add an optional `idempotencyKey` field to the publish body:

```json
POST /v1/events
{
  "type": "order.created",
  "idempotencyKey": "order-ord_123-created",
  "payload": { "orderId": "ord_123", "amount": 4200 }
}
```

Loopwire remembers the key for **24 hours**:

| Situation | Result |
|---|---|
| First request with this key | Event is published; returns `202` with a new `eventId` |
| Same key, **identical** payload, within 24h | Returns the **original** `eventId`. Nothing is re-published and no extra quota is used |
| Same key, **different** payload, within 24h | `409 Conflict`; nothing is published |
| Same key after 24h | Treated as a new key; the event is published again |

"Identical" means the whole request body, `type` included, must match. Changing a single field in the payload with the same key returns `409 Conflict`.

## Choosing good keys

A key should identify the **business fact**, not the HTTP attempt.

Good keys:

- `order-ord_123-created`: derived from the entity and the action.
- An outbox table row ID: unique per intended event and stable across retries.

Bad keys:

- A random UUID generated on each attempt. Every retry looks new, so there's no protection at all.
- A timestamp, which changes on retry.
- A key reused for two different events. The second one fails with `409`.

Keys are scoped to the project. Two projects can use the same key independently.

## Using keys with retries

```js
const key = `order-${order.id}-created`;
for (let attempt = 1; attempt <= 5; attempt++) {
  const res = await publish({ type: 'order.created', idempotencyKey: key, payload });
  if (res.status === 202) return res.json(); // new or original eventId
  if (res.status === 409) throw new Error('Key reused with a different payload');
  if (res.status !== 429 && res.status !== 500) throw new Error(`Publish failed: ${res.status}`);
  await sleep(backoff(attempt, res.headers.get('Retry-After')));
}
```

The official SDKs auto-retry `429` and `500` for up to 5 attempts. When you pass `idempotencyKey`, it is reused on every attempt automatically.

## Batch publishing

Each event in `POST /v1/events/batch` can have its own `idempotencyKey`. Keys are evaluated per event, so a batch can return `207 Multi-Status` where some events are new, some return their original `eventId`, and one is rejected with `409`.

## What idempotency does *not* cover

- **Delivery duplicates.** `idempotencyKey` stops duplicate *publishes*. It does not stop a subscriber from receiving the same event twice when a delivery times out and is retried. Subscribers must deduplicate on `Loopwire-Event-Id`; see Event Ordering & Deduplication.
- **Retries after 24 hours.** An outbox worker stuck for longer than a day and then retried will publish a new event. Mark outbox rows as done once you receive the `202`.
- **Test vs live.** Keys used with `lw_test_...` and with `lw_live_...` keys are tracked separately.

## Edge cases

- **A key is sent twice while the first request is still in flight.** The second request waits for the first to finish, then returns the same `eventId`.
- **The first request failed validation (`400`).** Nothing was stored, so you can fix the payload and reuse the same key.
- **The first request got `402` (quota exceeded).** Nothing was published. After you upgrade, the same key publishes normally.
