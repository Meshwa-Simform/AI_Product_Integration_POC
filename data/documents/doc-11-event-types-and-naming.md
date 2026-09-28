# Event Types & Naming

Every event you publish carries a `type` that describes what happened. Types drive subscriber filtering, key scoping, schema validation and dashboard search, so choosing a consistent naming scheme early saves pain later.

## Format rules

An event type is lowercase, dot-separated `resource.action`, validated against:

```
^[a-z0-9_]+(\.[a-z0-9_]+)+$
```

- At least two segments (`order.created` is valid; `order` alone is not).
- Only lowercase letters, digits and underscores within a segment.
- Maximum 64 characters in total.
- Types that don't match are rejected at publish time with `400 Bad Request` and error code `invalid_event_type`.

| Example | Valid? | Why |
|---|---|---|
| `order.created` | ✅ | |
| `billing.invoice.payment_failed` | ✅ | three segments are fine |
| `user.v2.updated` | ✅ | digits allowed |
| `Order.Created` | ❌ | uppercase |
| `order-created` | ❌ | hyphen, single segment |
| `order.` | ❌ | empty segment |

## Types are implicit

You don't need to register a type before publishing it — the first successful publish of a new type makes it appear in the dashboard's **Event Types** list. Registering a type explicitly (`PUT /v1/event-types/{type}`) is only needed if you want to attach a description or a JSON Schema (see Payload Schema Validation).

The reserved prefix `loopwire.` is used by the platform itself (for example `loopwire.test`, sent by subscriber test pings). Publishing a type starting with `loopwire.` returns `400` with code `reserved_event_type`.

## Recommended conventions

- **Resource first, past-tense action second**: `invoice.paid`, `shipment.delivered`. Readers can group by resource and wildcard filters (`invoice.*`) work naturally.
- **Use snake_case inside segments**: `payment_method.attached`, not `paymentMethod.attached` (uppercase is invalid anyway).
- **Version by adding a segment, not by changing meaning**: if the payload for `user.updated` changes incompatibly, publish `user.v2.updated` alongside the old type and migrate subscribers, rather than silently changing `user.updated`'s shape.
- **Keep types coarse enough to filter on**: `order.status_changed` with a `status` field in the payload is often better than ten separate `order.<status>` types — unless subscribers only care about one status.

## Limits

- There is no limit on the number of distinct event types per project.
- Subscriber `eventTypes` filters accept at most 50 entries.
- Scoped API keys (created via `POST /v1/keys` with a `scope` field) can be restricted to exactly one event type; they cannot use wildcards. A key scoped to `order.created` receives `403 Forbidden` if it publishes `order.updated`.

## Renaming and retiring types

Types can't be renamed in place — events already published keep the type they were published with. To rename:

1. Start publishing the new type (optionally dual-publish both for a transition period — remember each publish counts separately toward quota).
2. Add the new type to every subscriber's `eventTypes` filter.
3. Stop publishing the old type, then remove it from filters.

A retired type stays in the **Event Types** list until no events of that type remain within your retention window (30 days on Free/Growth, 90 days on Scale), then disappears automatically.

## Gotchas

- Type matching is exact and case-sensitive by construction: a subscriber filtering on `order.created` will never receive `order.created_v2`.
- The type is part of the payload used for idempotency: re-sending the same `idempotencyKey` with a different `type` is treated as a different payload and returns `409 Conflict`.
