# Event Log & Search

The **Event Log** in the dashboard is a searchable history of every event published to a project within its retention window, together with the delivery results for each subscriber. It's the first place to look when a subscriber says "we never got that event".

## What's in the log

Each row is one published event and shows:

- `eventId` (`evt_...`), event `type`, and `createdAt` timestamp.
- The API key that published it (last 4 characters only).
- A delivery summary: counts of `delivered`, `retrying`, `failed`, `skipped` and `pending` deliveries.
- Tags such as `schema_warning` (see Payload Schema Validation) and `redelivered`.

Clicking a row opens the event detail page with the full payload, every delivery attempt per subscriber (request headers, response status, the first 1KB of the response body, and latency), and **Redeliver** buttons.

## Retention

The log only covers events within the retention window: **30 days** on Free and Growth, **90 days** on Scale. After that, payloads are permanently deleted and the events disappear from the log and from `GET /v1/events`. Loopwire keeps only delivery metadata (timestamps, status codes, attempt counts) beyond that point, and that metadata is not searchable in the Event Log.

If you downgrade from Scale, your 90-day retention continues until the start of the next billing cycle; after that, events older than 30 days are deleted.

## Search and filters

The search bar accepts:

| Input | Behaviour |
|---|---|
| `evt_...` | Jumps straight to that event. |
| `dlv_...` | Opens the event that delivery belongs to. |
| `sub_...` | Filters to events routed to that subscriber. |
| An event type, e.g. `order.created` | Exact type filter. Wildcards (`order.*`) are supported. |
| An idempotency key | Finds the event published with that key (exact match). |

Additional filters: date range, delivery status (e.g. **Has failed deliveries**), **Schema warnings only**, and **Live / Test** mode. Test-mode events (published with `lw_test_...` keys) live in a separate view and are never mixed with live events.

**Payload search** (searching for a value inside payloads, such as a customer ID) is available on Growth and Scale plans. It matches exact string values of top-level and nested fields, case-sensitive, and scans at most the last 7 days of events per query. Free-plan projects can only filter by the fields above.

## Exporting

**Export CSV** downloads the current filtered view — up to 10,000 rows per export — with event ID, type, timestamp and delivery summary. Payloads are not included in CSV exports. For full-payload exports, page through `GET /v1/events` and fetch each event via `GET /v1/events/{eventId}`, or register a catch-all subscriber that archives every event to your own storage.

## API equivalent

Everything in the Event Log is available through the Events API:

- `GET /v1/events?type=order.created&created_after=2026-03-01T00:00:00Z` for listing (cursor-based: `limit` default 20, max 100, `starting_after`).
- `GET /v1/events/{eventId}` for the payload.
- `GET /v1/events/{eventId}/deliveries` for per-subscriber delivery status.

Payload search is dashboard-only.

## Access control

All roles, including Viewer, can browse the Event Log. Viewers can see payloads but cannot redeliver events. Redelivery requires the Developer role or above.

## Troubleshooting with the log

- **Event missing entirely** → the publish never succeeded. Check your client logs for `400`, `401`, `402`, `403` or `429` responses; rejected publishes are not stored.
- **Event present, no delivery for a subscriber** → the subscriber's `eventTypes` filter didn't match, or the subscriber was created after the event.
- **Delivery `skipped`** → the subscriber was paused when the event was published; it will not be retried automatically.
- **Delivery `failed`** → all 6 attempts failed; see Failed Deliveries View.
