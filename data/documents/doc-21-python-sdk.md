# Python SDK

The official Python SDK is published on PyPI as `loopwire`. It provides a synchronous client (`Loopwire`) and an asyncio client (`AsyncLoopwire`) with identical method names, automatic retries for rate-limited and server-error responses, and a `verify_signature()` helper.

## Requirements and installation

Python 3.9 or later is required. The SDK depends on `httpx` for HTTP and is fully type-annotated.

```
pip install loopwire
```

## Creating a client

```python
import os
from loopwire import Loopwire

client = Loopwire(api_key=os.environ["LOOPWIRE_API_KEY"])
```

If `api_key` is omitted, the client reads `LOOPWIRE_API_KEY` from the environment and raises `loopwire.ConfigurationError` if it is missing.

Constructor arguments:

| Argument | Default | Notes |
|---|---|---|
| `api_key` | `LOOPWIRE_API_KEY` env var | `lw_live_...` or `lw_test_...` |
| `base_url` | `https://api.loopwire.dev/v1` | Use `https://api.eu.loopwire.dev/v1` for EU-region projects (Scale only). |
| `api_version` | project's pinned version | Sent as `Loopwire-Version`, e.g. `"2026-01-15"`. |
| `max_attempts` | `5` | Total attempts including the first; values above 5 raise `ValueError`. |
| `timeout` | `30.0` | Seconds per attempt. |

Clients hold a connection pool. Create one per process and reuse it; use `with Loopwire() as client:` or call `client.close()` when finished.

## Publishing events

```python
resp = client.events.publish(
    type="order.created",
    payload={"order_id": "ord_123", "amount": 4200},
    idempotency_key="order-ord_123-created",
)
print(resp.event_id)  # evt_...
```

The call returns after the API responds `202 Accepted`. Event types are validated locally against `^[a-z0-9_]+(\.[a-z0-9_]+)+$` (max 64 characters) and payloads over 256KB raise `loopwire.ValidationError` without sending a request.

Reusing an `idempotency_key` within 24 hours with an identical payload returns the original `event_id`; reusing it with a different payload raises `loopwire.ConflictError` (409).

### Batch publishing

```python
result = client.events.publish_batch([
    {"type": "user.updated", "payload": {"user_id": "u_1"}},
    {"type": "user.updated", "payload": {"user_id": "u_2"}},
])
failed = [r for r in result.results if r.status != 202]
```

Up to 100 events and 1MB total per batch. A partially failed batch returns `207 Multi-Status`; `publish_batch()` does not raise in that case, so check `result.results`.

## Async usage

```python
import asyncio
from loopwire import AsyncLoopwire

async def main():
    async with AsyncLoopwire() as client:
        await asyncio.gather(*[
            client.events.publish(type="user.signed_up", payload={"user_id": uid})
            for uid in user_ids
        ])

asyncio.run(main())
```

Concurrency is not throttled by the SDK. Firing thousands of publishes at once will hit your plan's rate limit (10 req/s on Free, 50 on Growth, 500 on Scale); prefer `publish_batch()` or an `asyncio.Semaphore`.

## Pagination

```python
for sub in client.subscribers.list(limit=100):  # auto-paginates
    print(sub.id, sub.url, sub.status)

page = client.events.list(limit=50).first_page()
print(page.has_more, page.next_cursor)
```

## Errors and retries

`429` and `500` responses and network errors are retried automatically with exponential backoff, honoring `Retry-After`, up to `max_attempts` (5) attempts in total. Other errors raise immediately.

| Exception | Status |
|---|---|
| `loopwire.BadRequestError` | 400 |
| `loopwire.AuthenticationError` | 401 |
| `loopwire.QuotaExceededError` | 402 |
| `loopwire.PermissionDeniedError` | 403 |
| `loopwire.NotFoundError` | 404 |
| `loopwire.ConflictError` | 409 |
| `loopwire.RateLimitError` | 429 (after retries exhausted) |
| `loopwire.InternalServerError` | 500 (after retries exhausted) |
| `loopwire.ValidationError` | local validation, no request sent |

All inherit from `loopwire.LoopwireError` and expose `.status`, `.code`, `.message`, and `.request_id`. Include `request_id` when contacting support.

```python
from loopwire import QuotaExceededError, PermissionDeniedError

try:
    client.events.publish(type="invoice.paid", payload=data)
except QuotaExceededError:
    notify_billing_team()          # 402: upgrade plan or wait for cycle reset
except PermissionDeniedError as e:
    log.error("suspended or key lacks scope: %s", e.message)  # 403
```

## Verifying deliveries

```python
from flask import Flask, request, abort
from loopwire import verify_signature

app = Flask(__name__)

@app.post("/webhooks/loopwire")
def webhook():
    raw = request.get_data()  # bytes, before any JSON parsing
    if not verify_signature(raw, request.headers.get("Loopwire-Signature", ""), SIGNING_SECRET):
        abort(400)
    enqueue(raw)
    return "", 200
```

`verify_signature()` uses `hmac.compare_digest` and accepts either signature during a secret rotation. In Django use `request.body`; in FastAPI use `await request.body()`. Never verify against `json.dumps(request.json)`.

## Gotchas

- The sync client is thread-safe; the async client must be used from a single event loop.
- Set `LOOPWIRE_LOG=debug` to log attempts, backoff delays, and request IDs via the standard `logging` module (logger name `loopwire`). Keys are redacted.
- Django/Celery: create the client at module import, not per task, to reuse connections.
