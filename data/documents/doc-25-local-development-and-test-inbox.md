# Local Development & the Test Inbox

Loopwire has a built-in test mode so you can develop and debug integrations without a public URL, without affecting real subscribers, and without using your monthly event quota.

## Test mode vs live mode

The mode is determined entirely by the API key:

| | `lw_test_...` key | `lw_live_...` key |
|---|---|---|
| Destination | Project test inbox in the dashboard | Real subscriber endpoints |
| Counts against monthly quota | No | Yes |
| Rate limits | Same per-plan limits as live | Per-plan limits |
| Signing | Deliveries forwarded by the CLI are signed with a session secret | Signed with each subscriber's secret |

Test and live data are fully separated: test events never appear in the live Event Log, and live events never appear in the test inbox. Rate limits still apply in test mode, so a load test with a test key can still receive `429 Too Many Requests`.

## The test inbox

Open **Dashboard > Test Inbox** to see every event published with a test key. For each event you can view:

- The exact JSON body a subscriber would receive (`eventId`, `type`, `payload`, `timestamp`).
- The delivery headers that would be sent, including `Loopwire-Signature`.
- Which of your configured subscribers' `eventTypes` filters would have matched it.

The test inbox keeps the most recent 500 test events per project; older test events drop off automatically. Clear it at any time with **Clear inbox**.

## Forwarding to your machine

To exercise your real handler code, forward test events with the CLI:

```
loopwire listen --forward-to http://localhost:3000/webhooks/loopwire
```

Then, in another terminal:

```
loopwire events trigger order.created --payload '{"orderId":"ord_123"}'
```

Your local server receives a POST identical to a real delivery. Use the session signing secret that `listen` prints at startup to verify signatures locally. Forwarded requests have the same 10-second response window as real deliveries, but failed forwards are not retried.

Alternatives if you can't install the CLI:

- A tunnel (for example ngrok or Cloudflare Tunnel) that exposes an HTTPS URL, registered as a subscriber in a **separate development project**. This exercises the real retry schedule but uses that project's quota when publishing with a live key.
- Mocking deliveries in unit tests using the payload format from the Webhooks Overview.

## Recommended project layout

Create one project per environment (for example `myapp-dev`, `myapp-staging`, `myapp-prod`). Each project has its own keys, subscribers, event log, and signing secrets, so a mistake in development cannot publish to production subscribers. Plan limits on the number of projects apply: Free allows 2, Growth 10, Scale unlimited.

## Testing failure handling

Useful scenarios to test before going live:

1. **Signature failure** — send a request with a tampered body to your handler and confirm it is rejected.
2. **Slow handler** — make your handler sleep longer than 10 seconds and confirm you understand that Loopwire would treat it as a failure; move slow work to a background queue.
3. **Duplicate delivery** — trigger the same event twice with `loopwire events redeliver` and confirm your handler is idempotent (dedupe on `eventId`).
4. **Out-of-order delivery** — Loopwire does not guarantee ordering; make sure your handler uses the payload `timestamp`, not arrival order.
5. **Publisher errors** — force a `400` with an invalid event type (e.g. `OrderCreated`, which fails `^[a-z0-9_]+(\.[a-z0-9_]+)+$`) and a `409` by reusing an idempotency key with a different payload.

## Environment variables

A common convention (used by the SDKs and CLI):

```
LOOPWIRE_API_KEY=lw_test_xxx
LOOPWIRE_SIGNING_SECRET=whsec_xxx   # session secret from `loopwire listen` locally
```

Keep these in a `.env` file excluded from source control. Never commit a `lw_live_...` key, even in a private repository.

## Gotchas

- Switching from a test key to a live key is the only change needed to go live — double-check your deployment's key before launch.
- Events you publish in test mode are not replayable into live mode.
- The test inbox shows what *would* have matched each subscriber, but paused-subscriber logic still applies: a paused subscriber shows those events as `skipped`.
