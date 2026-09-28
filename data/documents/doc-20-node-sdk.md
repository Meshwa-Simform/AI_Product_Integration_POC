# Node.js SDK

The official Node.js SDK is published on npm as `@loopwire/node`. It wraps the Loopwire REST API (`https://api.loopwire.dev/v1`), handles authentication, retries rate-limited and server-error responses automatically, and ships a `verifySignature()` helper for subscriber endpoints.

## Requirements and installation

The SDK requires Node.js 18 or later (it uses the built-in `fetch`). It ships both ESM and CommonJS builds and includes TypeScript type definitions.

```
npm install @loopwire/node
```

## Creating a client

```js
import { Loopwire } from '@loopwire/node';

const loopwire = new Loopwire({
  apiKey: process.env.LOOPWIRE_API_KEY, // lw_live_... or lw_test_...
});
```

Client options:

| Option | Default | Description |
|---|---|---|
| `apiKey` | `process.env.LOOPWIRE_API_KEY` | API key sent as `Authorization: Bearer <key>`. |
| `baseUrl` | `https://api.loopwire.dev/v1` | Set to `https://api.eu.loopwire.dev/v1` for EU-region projects (Scale plan only). |
| `apiVersion` | project's pinned version | Sent as the `Loopwire-Version` header, e.g. `2026-01-15`. |
| `maxAttempts` | `5` | Total attempts per request, including the first. Cannot be set above 5. |
| `timeoutMs` | `30000` | Per-attempt request timeout. |

The client throws at construction time if no API key is found, rather than failing on the first request.

## Publishing events

```js
const { eventId } = await loopwire.events.publish({
  type: 'order.created',
  payload: { orderId: 'ord_123', amount: 4200 },
  idempotencyKey: 'order-ord_123-created',
});
```

`publish()` resolves once the API has returned `202 Accepted`; delivery to subscribers happens asynchronously. The event type must match `^[a-z0-9_]+(\.[a-z0-9_]+)+$` and be at most 64 characters — the SDK validates this locally and throws a `LoopwireValidationError` before making a request. Payloads larger than 256KB are also rejected locally.

### Batch publishing

```js
const result = await loopwire.events.publishBatch([
  { type: 'user.updated', payload: { userId: 'u_1' } },
  { type: 'user.updated', payload: { userId: 'u_2' } },
]);

for (const item of result.results) {
  if (item.status !== 202) console.error(item.index, item.error);
}
```

A batch can contain up to 100 events and 1MB of total body. Each event counts as one event toward your monthly quota, but the whole batch counts as a single request toward your rate limit. If some events fail, the API returns `207 Multi-Status` and `publishBatch()` resolves (it does not throw) — always inspect `result.results`. The SDK splits nothing automatically: passing 101 events throws `LoopwireValidationError`.

## Managing subscribers

```js
const sub = await loopwire.subscribers.create({
  url: 'https://example.com/webhooks/loopwire',
  eventTypes: ['order.created', 'order.shipped'],
});
console.log(sub.id, sub.signingSecret); // sub_..., whsec_...
```

`signingSecret` is only present in the response to `create()`. Store it immediately in your secrets manager.

Other methods: `subscribers.list()`, `subscribers.retrieve(id)`, `subscribers.update(id, fields)`, `subscribers.pause(id)`, `subscribers.resume(id)`, `subscribers.delete(id)`.

## Pagination

List methods return async iterators that follow cursors (`starting_after` / `next_cursor`) for you:

```js
for await (const event of loopwire.events.list({ limit: 100 })) {
  console.log(event.id, event.type);
}
```

`limit` defaults to 20 and is capped at 100 per page. To fetch a single page instead, call `.page()`: `const { data, hasMore, nextCursor } = await loopwire.events.list({ limit: 50 }).page();`.

## Retries and errors

The SDK automatically retries `429 Too Many Requests` and `500 Internal Server Error` responses with exponential backoff, honoring the `Retry-After` header when present, up to `maxAttempts` (5) total attempts. Network errors (connection reset, DNS failure, timeout) are retried the same way.

It does **not** retry:

- `402 Payment Required` — monthly quota exceeded; retrying cannot help until you upgrade or the cycle resets.
- `400`, `401`, `403`, `404`, `409` — these indicate a problem with the request itself.

Errors are thrown as subclasses of `LoopwireError` with `status`, `code`, `message`, and `requestId` properties:

```js
import { LoopwireError, QuotaExceededError } from '@loopwire/node';

try {
  await loopwire.events.publish({ type: 'order.created', payload });
} catch (err) {
  if (err instanceof QuotaExceededError) alertBilling(err); // 402
  else if (err instanceof LoopwireError) console.error(err.status, err.code, err.requestId);
  else throw err;
}
```

Error classes: `BadRequestError` (400), `AuthenticationError` (401), `QuotaExceededError` (402), `PermissionDeniedError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429 after retries are exhausted), `InternalServerError` (500 after retries are exhausted), `LoopwireValidationError` (local validation, no request made).

Because retries are automatic, avoid wrapping SDK calls in your own retry loop — nested retries multiply the attempt count and can amplify a rate-limit problem.

## Verifying deliveries

```js
import express from 'express';
import { verifySignature } from '@loopwire/node';

app.post('/webhooks/loopwire', express.raw({ type: 'application/json' }), (req, res) => {
  const ok = verifySignature(req.body, req.header('Loopwire-Signature'), process.env.LOOPWIRE_SIGNING_SECRET);
  if (!ok) return res.status(400).send('invalid signature');
  res.status(200).end(); // acknowledge within 10 seconds
  processAsync(JSON.parse(req.body));
});
```

`verifySignature()` takes the raw body as a `Buffer` or string, uses a constant-time comparison, and accepts either of the two comma-separated signatures sent during a signing-secret rotation. Passing an already-parsed JSON object returns `false`, because re-serialization changes the bytes. See Signature Verification Code Samples for more frameworks.

## Gotchas

- Use `lw_test_...` keys in development and CI; test events go to the test inbox and never count against quota.
- Never bundle the SDK with a key into browser code — every key has publish access to its project.
- Logging: set `LOOPWIRE_LOG=debug` to print request IDs, attempts, and backoff delays to stderr. API keys are always redacted in logs.
