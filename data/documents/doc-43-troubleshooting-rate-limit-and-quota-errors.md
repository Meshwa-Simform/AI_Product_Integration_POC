# Troubleshooting Rate Limit & Quota Errors

Loopwire uses two different limits, and they fail with two different status codes. Confusing them is the most common cause of runaway retry loops.

| | Rate limit | Monthly event quota |
|---|---|---|
| Status | `429 Too Many Requests` | `402 Payment Required` |
| Window | Per second (with burst) | Per billing cycle |
| Retry helps? | Yes, with backoff | No, never |
| Fix | Slow down, batch, or upgrade | Upgrade the plan or wait for the cycle to reset |

## Rate limits by plan

| Plan | Sustained | Burst |
|---|---|---|
| Free | 10 requests/second | 20 |
| Growth | 50 requests/second | 150 |
| Scale | 500 requests/second | 1000 |

## Handling 429 Too Many Requests

A `429` response includes a `Retry-After` header in seconds. The recommended client behavior:

1. Wait for `Retry-After` seconds, or a default base delay if the header is absent.
2. Retry the request.
3. On each further `429`, double the delay.
4. Stop after **5 attempts in total** and surface the error.

```js
async function publishWithBackoff(event, attempt = 1) {
  const res = await fetch('https://api.loopwire.dev/v1/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.LOOPWIRE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if ((res.status === 429 || res.status === 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    const delayMs = (retryAfter || 0.5 * 2 ** (attempt - 1)) * 1000;
    await new Promise((r) => setTimeout(r, delayMs));
    return publishWithBackoff(event, attempt + 1);
  }
  return res;
}
```

The official SDKs (`@loopwire/node`, `loopwire` for Python, `loopwire-go`) already do this for `429` and `500`, so don't add a second retry loop around them. Nested retries multiply the number of attempts.

### Reducing 429s

- **Batch publishing:** `POST /v1/events/batch` accepts up to 100 events (1MB body in total) and counts as **1 request** toward the rate limit, but each event still counts as 1 event toward your quota.
- **Smooth out bursts:** a nightly job that publishes 10,000 events in a tight loop will hit the Free plan's burst limit of 20 almost immediately. Put a client-side limiter in front of the publisher.
- **Share one limiter across workers:** 10 workers each "limited" to 10 requests/second add up to 100 requests/second against the same project.

## Handling 402 Payment Required

A `402` means the project has used up its monthly event quota:

| Plan | Monthly event quota |
|---|---|
| Free | 10,000 events |
| Growth | 250,000 events |
| Scale | Unlimited, billed per additional event above 2,000,000 |

Quota is checked when an event is published. **Do not retry a 402**: every later publish fails the same way until you upgrade the plan, enable Growth overage billing, or the billing cycle resets. Treat a `402` as a paging alert, not as a transient error.

### Checking remaining quota

`GET /v1/usage` returns the current request rate, the remaining monthly quota, and the quota reset date. The dashboard shows the same data under **Billing > Usage**. A good practice is to alert when the remaining quota drops below 10%; see Monitoring & Alerts.

### What counts as an event

- Each successful `POST /v1/events` call counts as 1 event, no matter how many subscribers receive it.
- Each event inside a batch counts as 1 event.
- Events published with `lw_test_...` keys never count against the quota.
- Manual redeliveries do not publish a new event.

## Worked examples

**A Growth project is at 249,990 events and publishes a batch of 20.** The quota is checked at publish time. The events that fit within the remaining 10 succeed, and the rest are reported as `402` in the `207 Multi-Status` per-event results.

**A 429 followed by a 500 on the retry.** Both are retryable. Keep backing off, doubling the delay each time, and stop at 5 attempts in total.

**A Growth project has published 260,000 events this month.** It went over the 250,000 quota at event 250,001, so the next publish also returns `402` (Growth overage billing is opt-in and off by default). Enable overage under **Billing > Plan > Overage**, upgrade to Scale, or wait for the billing cycle to reset.

**A 402 caused by a runaway loop.** Stop the publisher first. Upgrading from Free to Growth raises the monthly allowance to 250,000 events. Note that a downgrade only takes effect at the start of the next billing cycle.

## Gotchas

- Don't use `429` handling for `402`. Exponential backoff on a `402` just burns CPU and fills your logs.
- `Retry-After` is in **seconds**, not milliseconds.
- Rate limits apply per project, not per API key. Creating more keys does not raise the limit.
