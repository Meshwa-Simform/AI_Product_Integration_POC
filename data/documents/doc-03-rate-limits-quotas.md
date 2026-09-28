# Rate Limits & Quotas

Loopwire enforces two kinds of limits: a request rate limit (short-term) and a monthly event quota (plan-based). They behave differently and return different status codes, so handle them separately in your publisher.

| | Rate limit | Monthly event quota |
|---|---|---|
| What it measures | Requests per second | Events published per billing cycle |
| Status code when exceeded | `429 Too Many Requests` | `402 Payment Required` |
| Resolves itself by | Waiting (seconds) | Upgrading, or waiting for the billing cycle reset |
| Should the client retry? | Yes, with backoff | No |

## Rate limits

The `/v1/events` endpoint allows:

- **Free plan**: 10 requests/second, burst up to 20.
- **Growth plan**: 50 requests/second, burst up to 150.
- **Scale plan**: 500 requests/second, burst up to 1000.

When you exceed the rate limit, the API returns `429 Too Many Requests` with a `Retry-After` header (in seconds). Clients should implement exponential backoff: wait `Retry-After` (or a default base delay if absent), then retry, doubling the delay on each subsequent 429, up to a maximum of 5 attempts.

### How the burst works

Rate limits use a token bucket per project. The bucket holds the burst size (for example 20 on Free) and refills at the sustained rate (10 per second on Free). A quiet project can send 20 requests at once. After that, requests are admitted at 10 per second. Limits are per project, not per API key, so adding more keys to a project doesn't raise the limit.

### Batching to stay under the limit

`POST /v1/events/batch` accepts up to 100 events (1MB total body) in one request. The whole batch counts as **1 request** toward the rate limit, but **each event** counts as 1 event toward your monthly quota. On the Free plan, batching lets you publish up to 1,000 events per second without hitting `429`, although at that pace you would use up the 10,000-event monthly quota in about 10 seconds.

### Example backoff in Node

```js
async function publishWithBackoff(publish, maxAttempts = 5, baseMs = 500) {
  for (let attempt = 1; ; attempt++) {
    const res = await publish();
    if (res.status !== 429 && res.status !== 500) return res;
    if (attempt >= maxAttempts) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const delay = retryAfter ? retryAfter * 1000 : baseMs * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
}
```

The official SDKs already implement this: they retry `429` and `500` up to 5 attempts in total and honor `Retry-After`. They never retry `402`.

### Rate limit headers

Every `/v1/events` response includes:

- `X-RateLimit-Limit` — sustained requests per second for your plan.
- `X-RateLimit-Remaining` — tokens left in the bucket.
- `Retry-After` — seconds to wait (only on `429`).

## Monthly event quotas

- **Free plan**: 10,000 events/month.
- **Growth plan**: 250,000 events/month.
- **Scale plan**: unlimited, billed per additional event above 2,000,000.

Quota is checked at publish time. If you exceed your monthly quota, `/v1/events` returns `402 Payment Required` (not 429) — this is not a rate limit issue and retrying will not help until you upgrade your plan or the billing cycle resets.

### What counts as an event

- Each successful `POST /v1/events` call counts as 1 event, however many subscribers receive it.
- Each event inside a successful batch counts as 1 event.
- Retries and manual redeliveries do **not** count again.
- Test-mode events (`lw_test_...` keys) never count.
- Rejected requests (`400`, `401`, `402`, `403`, `429`) don't count.
- Idempotent replays (same `idempotencyKey`, same payload, within 24 hours) don't count again.

### Example: Growth plan near the limit

A Growth project has published 249,990 events this cycle. It sends a batch of 20 events. The first 10 are accepted and the remaining 10 are rejected with per-event `402` results inside a `207 Multi-Status` response. Every later publish returns `402` until the plan is upgraded or the cycle resets. Growth overage is charged per 1,000 additional events only when overage billing is enabled for the project (see the Billing & Pricing Tiers guide). The Free plan has no overage and always blocks at `402`.

## Checking current usage

`GET /v1/usage` returns your current request rate, remaining monthly quota, and the quota reset date. The dashboard also shows a live usage graph under **Billing > Usage**.

```
GET /v1/usage
{
  "plan": "growth",
  "requestRate": { "current": 12, "limit": 50, "burst": 150 },
  "quota": { "used": 184213, "limit": 250000, "remaining": 65787 },
  "resetsAt": "2026-10-14T00:00:00Z"
}
```

Poll `GET /v1/usage` at most once a minute. It is itself rate limited, separately from `/v1/events`.

## Other endpoint limits

Rate limits on read endpoints (listing events, deliveries, subscribers) are separate from `/v1/events` and are not published. They are high enough for dashboards and scripts. Use cursor pagination (`limit` up to 100) rather than many small requests.

## Planning checklist

- Estimate peak requests per second and compare against the sustained rate, not the burst.
- Use batch publishing for bulk jobs such as imports and backfills.
- Alert on `X-RateLimit-Remaining` approaching 0 and on quota usage above 80%.
- Treat `402` as an operational alert, not a transient error.
