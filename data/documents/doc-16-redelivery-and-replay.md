# Redelivery & Replay

Loopwire keeps event payloads for the retention window (**30 days** on Free and Growth, **90 days** on Scale), which means you can send past events to a subscriber again. There are two tools: **redelivery** for individual events and **replay** for a time range.

## Redelivering a single event

Use redelivery when a specific delivery `failed`, or when your consumer lost data and needs one event again.

- Dashboard: open the event in the Event Log (or Failed Deliveries view) and click **Redeliver**, optionally choosing a single subscriber.
- API:

```
POST /v1/events/evt_7Hq2kLm9/redeliver
{ "subscriberId": "sub_4Nf8Qa" }
```

Omit `subscriberId` to redeliver to every subscriber the event was originally routed to. The response is `202 Accepted`.

A redelivery:

- Creates a new attempt sequence on the existing delivery and **resets its retry counter**, so it gets the full original attempt plus 5 retries again.
- Sends the same `Loopwire-Event-Id` and the same payload; `Loopwire-Delivery-Attempt` starts again from `1`.
- Is signed with the subscriber's *current* signing secret.
- Does **not** count as a new event against your monthly quota, and does not count toward the `/v1/events` rate limit.

Redelivery requires the Developer role or above. Viewers can see the button but not use it.

## Replaying a time range

Replay sends every event in a time window to one subscriber. It's designed for backfilling a newly created subscriber, recovering after an outage on your side, or re-sending events that were `skipped` while a subscriber was paused.

```
POST /v1/subscribers/sub_4Nf8Qa/replay
{
  "from": "2026-03-01T00:00:00Z",
  "to": "2026-03-02T00:00:00Z",
  "eventTypes": ["order.*"]
}
```

- `from` and `to` must fall within the retention window.
- `eventTypes` is optional; if omitted, the subscriber's own `eventTypes` filter is applied. Events that don't match are not sent.
- A single replay job can include at most **10,000 events**. Larger ranges return `400` with code `replay_too_large`; split them into smaller windows.
- Only one replay job per subscriber can run at a time. Starting another while one is running returns `400` with code `replay_in_progress`.
- The response is `202 Accepted` with a `replayId`. Track progress with `GET /v1/subscribers/{subscriberId}/replays/{replayId}` (`queued`, `running`, `completed`, `cancelled`) or cancel with `DELETE` on the same path.

Replayed events are delivered in `createdAt` order, but because deliveries are concurrent and retried independently, arrival order at your endpoint is still not guaranteed.

## Replay and paused subscribers

Events published while a subscriber is paused are recorded as `skipped` and are **not** delivered automatically when it resumes. If you want them, resume the subscriber and then replay the paused period. Replaying to a subscriber that is still paused returns `400` with code `subscriber_paused`.

## Quota and billing

Neither redelivery nor replay counts toward your monthly event quota: quota is based only on successful `POST /v1/events` calls (and events inside `POST /v1/events/batch`). This also means a project that has hit `402 Payment Required` can still redeliver and replay existing events.

A suspended project (failed payment, past the 7-day grace period) cannot redeliver or replay — those calls return `403 Forbidden`.

## Test mode

Test-mode events (published with `lw_test_...` keys) can be redelivered to the test inbox but cannot be replayed to real subscribers, and live events cannot be replayed to the test inbox.

## Consumer checklist

- Deduplicate on `Loopwire-Event-Id`, because redelivery and replay intentionally send events you may already have processed.
- Don't rely on `Loopwire-Delivery-Attempt` to detect replays — it restarts at `1`. Keep your own record of processed event IDs.
- Verify the signature with your current secret; during a secret rotation window, accept either signature in the header.
