# Monitoring & Alerts

Loopwire provides built-in delivery metrics and configurable alert rules, so you learn about failing subscribers or an exhausted quota before your customers do.

## What to monitor

| Signal | Why it matters | Where to see it |
|---|---|---|
| Delivery failure rate per subscriber | A broken endpoint silently builds up retries and `failed` events | **Subscribers > Endpoint > Metrics** |
| p95 subscriber response time | Response times close to the 10s timeout are about to turn into failures | **Subscribers > Endpoint > Metrics** |
| Failed Deliveries count | Events that exhausted all 6 attempts and need manual redelivery | **Failed Deliveries** |
| Publish `429` rate | You are near your plan's rate limit | Your own client logs; `GET /v1/usage` |
| Remaining monthly quota | A `402` blocks all publishing until you upgrade or the cycle resets | **Billing > Usage**; `GET /v1/usage` |
| Publish `401`/`403` rate | A revoked key, a suspended project, or an IP allowlist problem | Your own client logs |

## Built-in alert rules

Create alert rules under **Project Settings > Alerts > New Alert**. Each rule has a condition, an evaluation window, and one or more notification channels.

Available conditions:

- **Subscriber failure rate:** the percentage of failed attempts for a subscriber is above a threshold over a 5, 15, or 60 minute window. Recommended: above 20% over 15 minutes.
- **Subscriber response time:** p95 response time above a threshold in milliseconds. Recommended: above 5,000 ms over 15 minutes, which gives you headroom before the 10,000 ms timeout.
- **New failed deliveries:** any delivery reaches status `failed`, meaning all 6 attempts were used.
- **Quota usage:** monthly event usage crosses a percentage of the plan quota. Recommended: alerts at 80% and at 95%.
- **Subscriber paused:** a team member pauses a subscriber. This is useful because events published while a subscriber is paused are not queued.

Each rule fires once when its condition becomes true, and again when it resolves. It does not re-fire every minute while the condition stays true.

## Notification channels

- **Email:** any team member of the project. Available on every plan.
- **Slack, Datadog, PagerDuty:** see Integrations: Slack, Datadog & PagerDuty for setup and plan availability.
- **Webhook:** send alert notifications to any HTTPS URL. Alert payloads use the event type `loopwire.alert.triggered` or `loopwire.alert.resolved`, and they are signed exactly like normal deliveries.

## Using the Usage API

`GET /v1/usage` returns the current request rate, the remaining monthly quota, and the quota reset date. Poll it from your own monitoring (every 5 minutes is plenty) if you want the data in your own dashboards:

```js
const res = await fetch('https://api.loopwire.dev/v1/usage', {
  headers: { Authorization: `Bearer ${process.env.LOOPWIRE_KEY}` },
});
const usage = await res.json();
// alert if the remaining quota is below 10% of the plan's included events
```

A read-only scoped key is enough for this call, and it is the safer choice for a monitoring system.

## Instrumenting your own side

Loopwire can see only what reaches its API and what your endpoint returns. You should also instrument:

- **Publisher:** count publishes by response status (`202`, `207`, `4xx`, `429`, `5xx`) and the latency of each publish.
- **Subscriber handler:** time from receipt to `2xx`, signature verification failures, and the duplicate rate (events skipped by `Loopwire-Event-Id` deduplication).
- **Background processing:** failures that happen *after* you returned `2xx`. Loopwire shows those as `delivered`, even though your business logic failed.

## Health during incidents

If you see failures across many subscribers at the same time, check status.loopwire.dev before debugging your own endpoints. During a Loopwire incident, deliveries continue on the normal retry schedule after service recovers, so you may see a burst of retries.

## Recommended starter setup

1. Failure-rate alert (above 20% over 15 minutes) on every production subscriber → Slack.
2. New failed deliveries → Slack.
3. Quota at 80% → email; quota at 95% → PagerDuty.
4. Subscriber paused → Slack.
5. A publisher-side alert on any `402`, which should page someone immediately.
