# Performance Best Practices

Recommendations for publishing at high volume, and for building subscriber endpoints that keep up with Loopwire's delivery rate.

## Publishing side

### Reuse connections

Create one HTTP client, or one SDK client instance, per process and reuse it. A new TLS handshake for every event adds 50–150 ms of latency and wastes CPU. The official SDKs keep connections alive by default.

```js
import { Loopwire } from '@loopwire/node';
const loopwire = new Loopwire({ apiKey: process.env.LOOPWIRE_KEY }); // create once, reuse everywhere
```

### Batch when you can

`POST /v1/events/batch` sends up to 100 events in one request (1MB body limit). The batch counts as **1 request** toward your rate limit, while each event still counts as 1 event toward quota. For bulk jobs such as backfills, nightly syncs, or imports, batching is usually the difference between hitting `429` and not.

Batch responses return `207 Multi-Status` when only some events fail. Always check the per-event results; a `207` is not a full success.

### Publish asynchronously from user-facing requests

Don't make a checkout or signup request wait on the Loopwire API. Write the event to your own outbox table or queue in the same transaction as the business change, then publish from a background worker. This also means an event is never lost when your process crashes between the database commit and the publish call.

### Use idempotency keys on retries

If a worker crashes after Loopwire accepted an event but before it recorded success, it will publish again. Send an `idempotencyKey` (for example your outbox row ID). Loopwire returns the original `eventId` for a repeat within 24 hours instead of publishing a duplicate. See the Idempotency Guide.

### Keep payloads lean

The payload limit is 256KB, but smaller payloads are faster to serialize, sign, deliver, and store. Send identifiers and the fields subscribers actually need. Subscribers can fetch large or sensitive data from your API.

### Stay under the rate limit on purpose

| Plan | Sustained | Burst |
|---|---|---|
| Free | 10 req/s | 20 |
| Growth | 50 req/s | 150 |
| Scale | 500 req/s | 1000 |

Put a token-bucket limiter in front of the publisher and size it slightly below your plan's sustained rate. Retries with backoff are for surprises, not for everyday traffic shaping.

## Subscriber side

### Acknowledge fast, process later

Loopwire waits **10 seconds** for a `2xx` response. The only thing a webhook handler should do synchronously is:

1. Read the raw body.
2. Verify `Loopwire-Signature`.
3. Put the event on your internal queue.
4. Return `200` (or `202`).

A handler that answers in under 200 ms stays healthy during traffic spikes. One that does database writes, third-party API calls, or email sending inline will time out under load, triggering retries and duplicate work.

### Scale horizontally

Deliveries for different events arrive concurrently. Run your webhook endpoint behind a load balancer with at least two instances, so a deploy or crash doesn't turn into a wave of timeouts and 6-attempt retry cycles.

### Make processing idempotent

Delivery is at-least-once. A timeout followed by a successful retry means your worker sees the same `Loopwire-Event-Id` twice. Deduplicate on that ID; see Event Ordering & Deduplication.

### Filter at the subscriber level

Use `eventTypes` on the subscriber so Loopwire only sends the events you need, instead of receiving everything and discarding most of it. Fewer deliveries mean less load, fewer retries, and cleaner logs.

## Measuring

- Watch p95 response time and failure rate per subscriber in the dashboard. Response times that creep toward 10,000 ms are an early warning.
- Use `GET /v1/usage` to track your current request rate against your plan's limit.
- Forward delivery metrics to Datadog or alerts to PagerDuty; see Integrations: Slack, Datadog & PagerDuty.

## Anti-patterns

- One HTTP client per event.
- Publishing inside a database transaction and holding locks while you wait on the network.
- Wrapping an SDK that already retries in another retry loop, which multiplies the attempts.
- Doing synchronous work in the webhook handler "because it's usually fast".
- Treating a `207` batch response as full success.
