# Subscriber Endpoint Design

How to build a webhook endpoint that is secure, fast, and correct under retries. It covers the patterns Loopwire recommends for every production subscriber.

## Requirements Loopwire enforces

- The URL must be **HTTPS** with a valid, publicly trusted certificate. Plain `http://` is rejected when the subscriber is created.
- The endpoint must accept `POST` with `Content-Type: application/json`.
- It must respond with a `2xx` status within **10 seconds**. Anything else, including a redirect, counts as a failure and triggers the retry schedule: 1min, 5min, 30min, 2h, and 12h after the first attempt, for 6 attempts in total.

## Headers on every delivery

| Header | Example | Use |
|---|---|---|
| `Loopwire-Signature` | `9f2c...e1` | Hex HMAC-SHA256 of the raw body, made with the subscriber's signing secret |
| `Loopwire-Event-Id` | `evt_abc123` | Deduplication key; stays the same across retries |
| `Loopwire-Delivery-Attempt` | `3` | Attempt number, 1–6 |
| `Loopwire-Timestamp` | `1768471200` | Unix seconds when this attempt was sent |

## The recommended handler shape

```js
import express from 'express';
import crypto from 'crypto';

const app = express();

app.post('/webhooks/loopwire', express.raw({ type: 'application/json' }), async (req, res) => {
  const signatures = (req.get('Loopwire-Signature') ?? '').split(',');
  const expected = crypto.createHmac('sha256', process.env.LOOPWIRE_SIGNING_SECRET).update(req.body).digest('hex');
  const valid = signatures.some(
    (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
  if (!valid) return res.status(400).send('invalid signature');

  const age = Date.now() / 1000 - Number(req.get('Loopwire-Timestamp'));
  if (!(age < 300)) return res.status(400).send('stale delivery');

  await queue.enqueue(JSON.parse(req.body)); // do the real work asynchronously
  res.status(200).end();
});
```

Key points:

1. **Use the raw body.** The HMAC is computed over the exact bytes Loopwire sent. Parsing and re-serializing the JSON changes whitespace and key order, and breaks verification.
2. **Compare in constant time.** Use `crypto.timingSafeEqual` or the SDK's `verifySignature()`, never `===`.
3. **Accept any of the listed signatures.** During a signing-secret rotation, the header contains two comma-separated signatures (new first) for 24 hours. Split on commas and accept a match with either one.
4. **Reject stale deliveries.** Checking `Loopwire-Timestamp` (a 5-minute tolerance is a sensible default) limits replay attacks. Loopwire itself doesn't enforce this check; it is a recommendation for your endpoint.
5. **Enqueue, then acknowledge.** Keep the synchronous path under 200 ms. Heavy work in the handler is the number one cause of timeouts.

## Choosing response codes

| Situation | Return | Effect |
|---|---|---|
| Accepted, or queued for processing | `200`/`202` | Delivered; no retry |
| Duplicate `Loopwire-Event-Id` you've already processed | `200` | Delivered; no retry. Don't return an error for duplicates |
| Invalid signature | `400` or `401` | Counted as a failure, so it will be retried. Investigate it; don't ignore it |
| Event type you don't handle | `200` | Better still, filter it out with the subscriber's `eventTypes` |
| Temporary problem (database down) | `503` | Retried on the normal schedule, which is what you want |

There is no status code that means "don't retry". Every non-2xx response is retried until all attempts are used. If you intend to drop an event permanently, return `200` and log it.

## Security checklist

- Verify every signature. An unsigned endpoint lets anyone forge events.
- Keep the signing secret (`whsec_...`) in a secrets manager, not in code.
- Optionally restrict inbound traffic to Loopwire's delivery IP ranges from `https://api.loopwire.dev/v1/ips`. Keep verifying signatures as well.
- Treat payload contents as untrusted input: validate the fields before you use them.
- Exclude the webhook route from CSRF protection and from session authentication. The signature is the authentication.

## Correctness checklist

- **Deduplicate** on `Loopwire-Event-Id`, because delivery is at-least-once.
- **Handle ordering** with the `timestamp` field, since events can arrive out of order during retries. See Event Ordering & Deduplication.
- **Process transactionally:** record the event ID and apply the change in one transaction.
- **Handle unknown fields:** new fields can be added to payloads, so don't reject events that contain fields you don't recognize.

## Operating the endpoint

- Run at least two instances behind a load balancer, so deploys don't cause timeouts.
- Pausing a subscriber during maintenance means events published during the pause are **not** delivered later (they are marked `skipped`). If you can't afford to lose those events, return `503` during maintenance instead. Loopwire will keep retrying for about 12 hours after the first attempt.
- Monitor p95 response time and failure rate; see Monitoring & Alerts.
- Test locally with a `lw_test_...` key and `loopwire listen --forward-to http://localhost:3000/webhooks/loopwire`.
