# API Versioning & Changelog

Loopwire uses date-based API versions so that breaking changes never reach your integration without an explicit opt-in.

## How versioning works

Each request can specify a version with the `Loopwire-Version` header:

```
POST /v1/events
Authorization: Bearer lw_live_xxx
Loopwire-Version: 2026-01-15
```

- If the header is present, the request is processed with that version's behavior.
- If the header is omitted, the request uses the project's **pinned version**.
- A project's pinned version is set to the current version when the project is created.
- An unknown or malformed version returns `400 Bad Request` with code `invalid_api_version`.

The current version is **`2026-01-15`**.

The `/v1` path prefix changes only for a complete redesign of the API; date-based versions handle everything else.

The version also controls the format of webhook deliveries sent to your subscribers. Deliveries use the project's pinned version, not the version of the request that published the event.

## Breaking vs non-breaking changes

These are **non-breaking** and ship to all versions without notice:

- New endpoints.
- New optional request fields.
- New fields in responses or delivery payloads.
- New event types, error codes, or delivery headers.
- Changing the format of opaque IDs (`evt_...`, `sub_...`) — never parse them.

Your code must ignore unknown fields. Anything else (removing or renaming fields, changing types or status codes, changing validation rules) is a **breaking** change and only ships in a new version.

## Upgrading your pinned version

1. Read the changelog entries between your pinned version and the target version.
2. Test by sending `Loopwire-Version: <new-version>` explicitly from a staging environment.
3. Upgrade the project under **Project Settings > API Version**. Only Owners and Admins can change it.
4. Within 72 hours of an upgrade you can roll back to the previous pinned version from the same page. After 72 hours, rollback is no longer available.

Because deliveries follow the pinned version, upgrading may change what your subscribers receive. Coordinate with the owners of subscriber endpoints.

## Deprecation policy

- Deprecations are announced in the changelog, by email to project Owners, and via a `Loopwire-Deprecation` response header on requests using the deprecated version.
- A deprecated version remains supported for **12 months** after its deprecation notice.
- After the sunset date, requests pinned to it are processed using the oldest supported version.

## Changelog

### 2026-01-15 (current)

- Added `POST /v1/events/batch`: up to 100 events and 1MB per request, one rate-limit request per batch, each event counted separately for quota. Partial failures return `207 Multi-Status`.
- Added the `Loopwire-Timestamp` delivery header (unix seconds).
- **Breaking:** list endpoints now return `next_cursor` alongside `has_more`; the `last_id` field was removed.
- **Breaking:** event types must match `^[a-z0-9_]+(\.[a-z0-9_]+)+$` (max 64 characters). Previously uppercase letters and hyphens were accepted.
- Version `2024-09-01` deprecated; sunset on 2027-01-15.

### 2025-06-01

- Added `Loopwire-Delivery-Attempt` delivery header (1–6).
- Added signing-secret rotation with a 24-hour overlap; during the overlap `Loopwire-Signature` carries two comma-separated signatures.
- **Breaking:** `409 Conflict` is now returned when an idempotency key is reused with a different payload. Previously the second request was silently accepted as a new event.
- Added EU region (`api.eu.loopwire.dev`) for Scale projects.

### 2024-09-01 (deprecated)

- Initial date-versioned release.
- Idempotency keys de-duplicated identical payloads only; differing payloads created new events.
- Pagination used `limit` and `starting_after` with a `last_id` response field.

## Non-versioned announcements

Changes that affect all versions (new endpoints, SDK releases, dashboard features) are posted at `https://loopwire.dev/changelog` and in the RSS feed `https://loopwire.dev/changelog.rss`. The OpenAPI spec for any version can be fetched with `https://api.loopwire.dev/v1/openapi.json?version=<version>`.

## SDKs and versions

Each SDK release declares a default API version, but SDKs send the `Loopwire-Version` header only when you configure it (`apiVersion`, `api_version`, or `WithAPIVersion`). For predictable behavior, set it explicitly and upgrade it deliberately, especially in CI.

## Gotchas

- Upgrading the pinned version in the dashboard immediately affects every request that doesn't send the header — including old deployments you forgot about.
- If your integration relies on 2024-09-01 idempotency behavior (differing payloads accepted), it will start receiving `409` after upgrading.
