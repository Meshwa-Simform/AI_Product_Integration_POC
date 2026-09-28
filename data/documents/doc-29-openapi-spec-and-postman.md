# OpenAPI Spec & Postman Collection

Loopwire publishes a machine-readable description of its REST API so you can generate clients, validate requests, and explore endpoints without writing code.

## OpenAPI specification

The spec is an OpenAPI 3.1 document:

- JSON: `https://api.loopwire.dev/v1/openapi.json`
- YAML: `https://api.loopwire.dev/v1/openapi.yaml`

Both are public and require no API key. By default they describe the current API version (`2026-01-15`). To fetch the spec for a specific version, pass it as a query parameter, e.g. `https://api.loopwire.dev/v1/openapi.json?version=2025-06-01`. The spec's `info.version` field always equals the API version it describes.

EU-region projects use the same spec; only the server URL differs (`https://api.eu.loopwire.dev/v1`). The spec lists both under `servers`.

### What the spec includes

- Every public endpoint (`/events`, `/events/batch`, `/events/{eventId}/redeliver`, `/subscribers`, `/keys`, `/usage`, `/ips`, and more).
- Request/response schemas, including the standard error body `{ "error": { "code": "...", "message": "..." } }`.
- Validation constraints: event type pattern `^[a-z0-9_]+(\.[a-z0-9_]+)+$` with `maxLength: 64`, `limit` bounds (default 20, maximum 100), and `maxItems: 100` for batch publishing.
- The webhook delivery payload, described under the top-level `webhooks` key (OpenAPI 3.1), including the `Loopwire-Signature`, `Loopwire-Event-Id`, `Loopwire-Delivery-Attempt`, and `Loopwire-Timestamp` headers.
- The `bearerAuth` security scheme.

Not included: dashboard-only features and internal endpoints.

### Generating a client

```
npx @openapitools/openapi-generator-cli generate \
  -i https://api.loopwire.dev/v1/openapi.json \
  -g java -o ./loopwire-java-client
```

Generated clients do not include the official SDKs' behavior — automatic retries for `429`/`500` with backoff (max 5 attempts, honoring `Retry-After`), local validation, and `verifySignature()`. Add these yourself, or prefer an official SDK for Node, Python, or Go.

### Validating requests in tests

Use the spec with a validator such as `openapi-backend` or Prism to catch malformed requests before they reach the API:

```
npx @stoplight/prism-cli mock https://api.loopwire.dev/v1/openapi.json
```

This starts a local mock server on port 4010 that validates requests and returns example responses — useful for offline unit tests. The mock does not implement real behavior such as idempotency or quota checks.

## Postman collection

The official collection is in the public **Loopwire API** workspace on Postman, and can also be downloaded from `https://api.loopwire.dev/v1/postman.json`.

Setup:

1. Fork the collection into your workspace.
2. Open the collection's **Variables** tab and set `apiKey` to a `lw_test_...` key.
3. Leave `baseUrl` as `https://api.loopwire.dev/v1`, or change it for EU projects.
4. Optionally set `apiVersion`; it is sent as the `Loopwire-Version` header on every request.

The collection has folders for Events, Subscribers, Keys, Usage, and Deliveries, with example requests and saved example responses for success and common errors (`400`, `401`, `402`, `409`, `429`).

A pre-request script generates a fresh `idempotencyKey` (UUID) for each **Publish event** request. To test idempotency behavior, disable the script and send the same request twice: the second call returns the original `eventId`; change the payload and send again to see `409 Conflict`.

## Keeping in sync

- The spec and collection are regenerated with every API release. Watch the changelog (see API Versioning & Changelog) or the RSS feed at `https://loopwire.dev/changelog.rss`.
- Pin the spec version in code generation (`?version=...`) so a new release doesn't silently change your generated client.

## Gotchas

- Postman's default "Send" uses your live key if you put one in `apiKey`. Events sent that way count against quota and reach real subscribers — keep a test key in the collection.
- Some generators mishandle the `207 Multi-Status` response for batch publishing; ensure your client treats it as success-with-partial-failures rather than an error.
