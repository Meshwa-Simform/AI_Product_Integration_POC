# Payload Schema Validation

By default Loopwire accepts any JSON object up to 256KB as an event `payload`. Schema validation lets you attach a JSON Schema to an event type so malformed payloads are caught at publish time instead of breaking your subscribers.

## Registering a schema

Schemas are attached per event type with:

```
PUT /v1/event-types/{type}/schema
{
  "mode": "enforce",
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["orderId", "amount", "currency"],
    "properties": {
      "orderId": { "type": "string", "pattern": "^ord_" },
      "amount": { "type": "integer", "minimum": 0 },
      "currency": { "type": "string", "enum": ["usd", "eur", "gbp"] }
    },
    "additionalProperties": true
  }
}
```

- Schemas must use JSON Schema **draft 2020-12**. Older drafts are rejected with `400`.
- Maximum schema size is 64KB. External `$ref`s (to URLs) are not resolved; internal `$ref`s to `$defs` are supported.
- Only one schema can be attached to a type at a time. A new `PUT` replaces it, and takes effect within about 30 seconds across all regions.
- Managing schemas requires the Admin or Owner role (or a full-access API key); Developers can view them.

`GET /v1/event-types/{type}/schema` returns the current schema and mode; `DELETE` removes it (equivalent to `mode: "off"`).

## Validation modes

| Mode | Behaviour on invalid payload |
|---|---|
| `off` | No validation (default for every type). |
| `warn` | The event is accepted (`202`) and delivered normally, but tagged `schema_warning` in the Event Log with the list of violations. |
| `enforce` | The publish is rejected with `400 Bad Request` and error code `schema_validation_failed`. The event is not stored and does not count toward quota. |

Example `enforce` rejection:

```
400 Bad Request
{
  "error": {
    "code": "schema_validation_failed",
    "message": "Payload does not match schema for order.created",
    "details": [
      { "path": "/amount", "message": "must be integer" },
      { "path": "", "message": "must have required property 'currency'" }
    ]
  }
}
```

At most 20 violations are listed in `details`.

## Rolling out a schema safely

1. Register the schema with `mode: "warn"`.
2. Watch the Event Log for events tagged `schema_warning` for a few days (filter **Schema warnings only**).
3. Fix the publishers that produce invalid payloads.
4. Switch to `mode: "enforce"`.

Jumping straight to `enforce` on a busy type is the most common way teams accidentally drop production events — a `400` is not retryable, so a client following the recommended backoff rules will give up immediately.

## Batch publishing

In `POST /v1/events/batch`, each event is validated independently. Invalid events in an `enforce` type are reported with status `400` and code `schema_validation_failed` inside the `207 Multi-Status` response; the valid events in the same batch are still accepted.

## Idempotency interaction

Validation runs before the idempotency check. If you retry a publish with the same `idempotencyKey` after switching a type to `enforce`, and the payload is now invalid, you get `400` rather than the original `eventId`.

## Evolving a schema

- **Additive changes** (new optional properties) are safe to apply in place.
- **Breaking changes** (new required fields, narrowed types) should be introduced as a new event type version, e.g. `order.v2.created`, following the conventions in Event Types & Naming.
- Schemas only affect new publishes. Events already stored are never re-validated.

## Gotchas

- The 256KB payload size limit is checked before schema validation; an oversized payload returns `400` with code `payload_too_large`, not `schema_validation_failed`.
- Schema validation applies to test-mode (`lw_test_...`) events too, which makes it a good way to catch problems in CI before they reach production.
- Subscribers still receive the payload exactly as published; Loopwire never strips unknown fields even when `additionalProperties` is `false` in `warn` mode.
