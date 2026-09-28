# Subscribers API Reference

A subscriber is an HTTPS endpoint that receives deliveries for the events you publish. Subscribers belong to a project and can be managed from the dashboard (**Subscribers**) or with the API endpoints below. All endpoints require an `Authorization: Bearer <key>` header with a key that has full (not read-only) access, except the `GET` endpoints, which read-only keys may call.

## Plan limits

| Plan | Subscribers per project |
|---|---|
| Free | 5 |
| Growth | 50 |
| Scale | 500 |

Creating a subscriber beyond your plan's limit returns `403 Forbidden` with error code `subscriber_limit_reached`. Paused subscribers still count toward the limit; deleted ones do not.

## POST /v1/subscribers — create

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | Must be `https://`. Plain `http://` URLs are rejected with `400`. Max 2048 characters. |
| `eventTypes` | array of strings | no | Filters which event types this subscriber receives. Omit to receive all event types. Supports wildcards like `order.*` (see Event Filtering & Routing). |
| `description` | string | no | Free-text label shown in the dashboard, max 200 characters. |
| `metadata` | object | no | Up to 20 string key/value pairs for your own bookkeeping. Not sent with deliveries. |

```
POST /v1/subscribers
{
  "url": "https://hooks.example.com/loopwire",
  "eventTypes": ["order.created", "order.shipped"],
  "description": "Fulfillment service"
}
```

**Response — `201 Created`**

```
{
  "subscriberId": "sub_4Nf8Qa",
  "url": "https://hooks.example.com/loopwire",
  "eventTypes": ["order.created", "order.shipped"],
  "status": "active",
  "signingSecret": "whsec_2f9c...",
  "createdAt": "2026-03-04T09:20:00Z"
}
```

The `signingSecret` is returned in full only in this response. Afterwards it can be re-viewed in the dashboard under **Subscribers > Endpoint > Signing Secret** by Admins and Owners.

A newly created subscriber only receives events published *after* it was created. To backfill earlier events, use a replay (see Redelivery & Replay).

## GET /v1/subscribers and GET /v1/subscribers/{subscriberId}

List (cursor-paginated: `limit` default 20, max 100, `starting_after`) or retrieve subscribers. The signing secret is never included in these responses.

## PATCH /v1/subscribers/{subscriberId} — update

Updates `url`, `eventTypes`, `description` or `metadata`. Changes apply to deliveries created after the update; deliveries already in `retrying` state continue to use the URL they were created with until they complete or fail. Changing `url` does not rotate the signing secret.

## DELETE /v1/subscribers/{subscriberId}

Deletes the subscriber permanently. Pending and retrying deliveries for it are cancelled. Deleted subscribers cannot be restored — you'd create a new one, which gets a new ID and a new signing secret. Returns `204 No Content`.

## POST /v1/subscribers/{subscriberId}/pause and /resume

Pausing stops new deliveries without deleting the subscriber. Events published while a subscriber is paused are **not queued** — their deliveries are recorded with status `skipped`, and only events published after `/resume` are delivered. Deliveries that were already `retrying` when you paused are held and resume their schedule after the subscriber is resumed.

Pausing an already-paused subscriber (or resuming an active one) is a no-op and returns `200`.

## POST /v1/subscribers/{subscriberId}/rotate-secret

Generates a new `whsec_...` signing secret and returns it in the response. The old secret stays valid for 24 hours; during that window each delivery's `Loopwire-Signature` header carries two comma-separated signatures, new secret first. See Signing Secret Rotation for a zero-downtime procedure.

## POST /v1/subscribers/{subscriberId}/test

Sends a synthetic `loopwire.test` event to the endpoint immediately and returns the endpoint's response status and latency. Test pings are not counted toward quota and are not retried.

## Errors

- `400` — non-HTTPS URL, invalid event type pattern, or more than 50 entries in `eventTypes`.
- `403` — subscriber limit reached, or key lacks permission.
- `404` — subscriber ID does not exist in this project.

## Gotchas

- The same URL can be registered as multiple subscribers (e.g. with different `eventTypes`). Each gets its own signing secret, and an event matching both is delivered twice, independently.
- Loopwire does not follow HTTP redirects: a `301`/`302` from your endpoint is treated as a non-2xx failure.
