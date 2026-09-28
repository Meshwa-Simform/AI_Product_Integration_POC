# Usage API Reference

The Usage API reports how much of your plan you're using: current request rate against the rate limit, and events published against the monthly quota. Use it to build internal dashboards or to throttle publishers before they hit `402 Payment Required`.

Any key for the project, including read-only keys, can call these endpoints. Usage calls do not count toward the `/v1/events` rate limit, but are themselves limited to **5 requests/second per project**.

## GET /v1/usage — current period

```
GET /v1/usage
Authorization: Bearer lw_live_xxx
```

```
{
  "plan": "growth",
  "periodStart": "2026-03-04T00:00:00Z",
  "periodEnd": "2026-04-04T00:00:00Z",
  "quotaResetDate": "2026-04-04",
  "events": {
    "used": 212480,
    "included": 250000,
    "remaining": 37520,
    "overage": 0
  },
  "rate": {
    "currentRps": 18.4,
    "limitRps": 50,
    "burstLimit": 150
  }
}
```

**Fields**

- `plan` — `free`, `growth` or `scale`.
- `periodStart` / `periodEnd` — the current billing cycle. Cycles are monthly and start on the day you upgraded, so they don't necessarily align with calendar months.
- `quotaResetDate` — when `events.used` resets to 0; the same day as the next billing cycle start.
- `events.used` — accepted events this period (each accepted `POST /v1/events` call, and each accepted entry in a batch, counts once regardless of subscriber count).
- `events.included` — 10,000 (Free), 250,000 (Growth), 2,000,000 (Scale).
- `events.remaining` — `max(included - used, 0)`.
- `events.overage` — events above `included`. On Growth these exist only when overage billing is enabled (it's opt-in and off by default) and are billed at $0.20 per 1,000. On Scale they're billed at $0.10 per 1,000. Always `0` on Free, since Free publishes are blocked with `402` once the quota is hit.
- `rate.currentRps` — average requests/second to `/v1/events` over the last 10 seconds.
- `rate.limitRps` / `rate.burstLimit` — 10/20 (Free), 50/150 (Growth), 500/1000 (Scale).

## GET /v1/usage/history — daily breakdown

```
GET /v1/usage/history?from=2026-03-01&to=2026-03-31&granularity=day
```

- `granularity` — `day` (default) or `hour`. Hourly data is kept for 7 days; daily data for 13 months.
- Returns `{ "data": [ { "date": "2026-03-01", "events": 8123, "requests": 7990, "rateLimited": 12 }, ... ] }`.
- `rateLimited` is the number of requests that received `429` in that bucket — useful for tuning client backoff.

## What is and isn't counted

| Activity | Counts toward event quota? |
|---|---|
| Accepted `POST /v1/events` (`202`) | Yes, 1 per call |
| Accepted entries in `POST /v1/events/batch` | Yes, 1 per event |
| Idempotent replay (same key + same payload) | No |
| Rejected publishes (`400`, `401`, `402`, `403`, `409`, `429`) | No |
| Test-mode events (`lw_test_...` keys) | No |
| Redeliveries and replays | No |
| Subscriber test pings (`loopwire.test`) | No |

Usage figures are updated within about 60 seconds of a publish, so a tight loop checking `events.remaining` before every publish can overshoot slightly. The authoritative check is at publish time, when the API returns `402` if the quota is exhausted.

## Usage alerts

Under **Billing > Usage > Alerts**, Owners can configure email alerts when `events.used` crosses **80%** and **100%** of the included quota (both enabled by default) plus one custom threshold. On Free, the 100% alert means publishing is now blocked until the quota resets or you upgrade; on Growth it means publishing is blocked with `402` unless overage billing is enabled, in which case overage billing has begun; on Scale overage billing has begun.

## Example: guard before a bulk job

```js
const usage = await fetch('https://api.loopwire.dev/v1/usage', {
  headers: { Authorization: `Bearer ${process.env.LOOPWIRE_API_KEY}` },
}).then((r) => r.json());

if (usage.plan === 'free' && usage.events.remaining < jobSize) {
  throw new Error(`Only ${usage.events.remaining} events left until ${usage.quotaResetDate}`);
}
```

## Gotchas

- Downgrading doesn't change `events.included` until the next billing cycle starts.
- Live and test usage are separate: calling `/v1/usage` with a `lw_test_...` key returns test-mode request counts and always shows `events.used: 0`.
