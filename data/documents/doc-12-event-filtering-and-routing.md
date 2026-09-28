# Event Filtering & Routing

When you publish an event, Loopwire decides which subscribers receive it. This routing happens once, at publish time, and produces one delivery record per matching subscriber.

## How routing works

For each active or paused subscriber in the project, Loopwire checks the event's `type` against the subscriber's `eventTypes` filter:

- **No filter** (`eventTypes` omitted or `null`): the subscriber receives every event type.
- **Filter present**: the subscriber receives the event only if the type matches at least one entry.

A delivery record is created for every matching subscriber. Active subscribers get a `pending` delivery; paused subscribers get a `skipped` delivery that is never attempted. Subscribers created after the event was published never receive it (unless you replay it).

Routing is evaluated per subscriber independently. If an event matches three subscribers, three deliveries are created, each with its own retry schedule; a failure on one does not affect the others. The event still counts as **one** event toward your monthly quota.

## Filter syntax

Each entry in `eventTypes` is either an exact type or a wildcard pattern:

| Pattern | Matches | Doesn't match |
|---|---|---|
| `order.created` | `order.created` | `order.created.v2`, `order.updated` |
| `order.*` | `order.created`, `order.shipped`, `order.item.added` | `order`, `orders.created` |
| `billing.invoice.*` | `billing.invoice.paid` | `billing.subscription.renewed` |

Rules:

- `*` is only allowed as the final segment, and it matches **one or more** remaining segments.
- A bare `*` is not allowed — omit `eventTypes` to receive everything.
- Mid-pattern wildcards like `*.created` are rejected with `400`.
- Maximum 50 entries per subscriber.

## Updating filters

Changing a subscriber's `eventTypes` (via `PATCH /v1/subscribers/{id}` or the dashboard) affects only events published after the change. Events published before the change are not re-routed. To send previously published events to a subscriber that now matches them, run a replay for that subscriber (see Redelivery & Replay).

## Routing patterns

**Fan-out**: one event, many consumers. Register one subscriber per service (fulfillment, analytics, email), each with the filters it needs. Each service verifies deliveries with its own signing secret.

**Environment separation**: don't use filters to separate staging from production — use separate projects (each with its own keys and subscribers) or `lw_test_...` keys for non-production traffic. Test-key events only go to the test inbox and never reach real subscribers.

**Catch-all audit sink**: a subscriber with no filter pointing at your data warehouse ingestion endpoint receives every live event, which is useful for analytics or compliance archiving beyond Loopwire's retention window.

**Per-tenant routing**: Loopwire does not filter on payload contents. If you need tenant-level routing (e.g. only events for customer A go to endpoint A), either encode it in the type (`tenant_a.order.created` — watch the 64-char limit) or have one receiving service fan out internally.

## Dashboard tools

Under **Subscribers > Endpoint > Routing**, the **Test a type** box shows whether a given event type would match that subscriber's filter. The event detail page in the Event Log lists every subscriber the event was routed to and the status of each delivery.

## Gotchas

- If no subscriber matches an event, it is still accepted (`202`), stored, and counted toward quota — it simply has zero deliveries.
- Two overlapping entries (`order.*` and `order.created`) in the same subscriber's filter don't cause duplicate deliveries; a subscriber gets at most one delivery per event.
- Registering the same URL as two subscribers with overlapping filters *does* produce two deliveries to that URL.
