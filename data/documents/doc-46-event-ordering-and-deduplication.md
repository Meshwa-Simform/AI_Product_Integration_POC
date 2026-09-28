# Event Ordering & Deduplication

Loopwire guarantees **at-least-once** delivery with **no ordering guarantee**. This guide explains what that means in practice and how to build subscribers that behave correctly anyway.

## Delivery guarantees

- **At-least-once:** every event is delivered at least once to each matching, active subscriber, as long as the endpoint eventually returns `2xx` within the retry schedule.
- **Not exactly-once:** the same event can be delivered more than once.
- **Not ordered:** events can arrive in a different order from the one they were published in.

## Why duplicates happen

1. **Timeouts that actually succeeded.** Your endpoint processes the event but responds after the 10-second timeout. Loopwire records a failure and retries 1 minute later, and your endpoint sees the event again.
2. **Lost responses.** Your endpoint returns `200`, but the connection drops before Loopwire reads the response. Loopwire treats this as a failure and retries.
3. **Manual redelivery.** Someone clicks **Redeliver** in the dashboard, or calls `POST /v1/events/{eventId}/redeliver`, for an event that had already been processed.
4. **Duplicate publishes.** Your publisher sent the same business event twice without an `idempotencyKey`. These are two *different* events with different `eventId`s; see the Idempotency Guide.

In cases 1–3 the `eventId` is the same. In case 4 it is not.

## Deduplicating on the subscriber

Every delivery carries the `Loopwire-Event-Id` header, and the same `eventId` in the body. It stays the same across every retry and redelivery of an event. The `Loopwire-Delivery-Attempt` header (1–6) tells you which attempt this is, but a value of `1` does **not** guarantee you haven't seen the event before, because manual redelivery restarts the count.

Record the IDs of processed events, and skip any you have already seen:

```sql
CREATE TABLE processed_events (
  event_id    TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```js
async function handle(event) {
  const inserted = await db.query(
    'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
    [event.eventId],
  );
  if (inserted.rowCount === 0) return; // duplicate, already processed
  await applyBusinessLogic(event);
}
```

Do the insert and the business logic in the same database transaction. Otherwise a crash between the two steps loses the event or processes it twice.

### How long to keep IDs

Keep processed IDs for at least as long as a retry or redelivery could still arrive. Automatic retries finish about 12 hours after the first attempt (the last retry is scheduled 12 hours after the first attempt). Manual redelivery is possible for the whole payload retention period: **30 days** on Free/Growth and **90 days** on Scale. Keeping IDs for the retention period is the safe choice.

## Handling out-of-order events

Ordering breaks most visibly during retries. For example, suppose `order.updated` (v1) fails and is retried 5 minutes later, while `order.updated` (v2) is delivered straight away. Your endpoint receives v2 first, then v1.

Strategies:

1. **Compare timestamps.** Every delivery body has a `timestamp` (the publish time). Keep the last applied timestamp for each entity, and ignore any event older than it.

```js
if (event.timestamp <= entity.lastEventTimestamp) return; // stale, skip it
```

2. **Include a version number in your payload.** If your source system has a row version or sequence number, include it (for example `payload.version`) and apply only increasing versions. This is more precise than timestamps when two events share the same second.
3. **Treat events as notifications.** On any `order.*` event, fetch the current state of the order from your own API instead of trusting the payload. Order stops mattering because you always read the latest state.
4. **Design commutative handlers.** Operations like "add tag X" or "set status to shipped if not already cancelled" can be written so that the order they are applied in doesn't matter.

Always use the `timestamp` field, not arrival time, to reconstruct order.

## Multiple subscribers

Each subscriber has its own independent delivery and retry schedule. Subscriber A may process an event hours before subscriber B, for example while B's endpoint is down. Never assume two subscribers see the same state at the same moment.

## Paused subscribers

Events published while a subscriber is paused are **not** queued. They are recorded with delivery status `skipped` and are never delivered automatically. This is a gap, not a reordering problem. If you need those events, redeliver them manually within the retention window.

## Summary

| Problem | Tool |
|---|---|
| Same event delivered twice | Deduplicate on `Loopwire-Event-Id` |
| Same business event published twice | `idempotencyKey` on publish |
| Events arrive out of order | `timestamp` or payload version checks, or fetching current state |
| Events missing after a pause | Manual redelivery; nothing was queued |
