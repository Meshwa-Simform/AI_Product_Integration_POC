# Getting Started Guide

Loopwire is a webhook delivery and event notification platform. It lets your application publish events (e.g. `order.created`, `user.updated`) and reliably delivers them as HTTP POST requests to subscriber endpoints you configure.

Instead of building your own retry queues, signature schemes, and delivery dashboards, you send each event to Loopwire once. Loopwire fans it out to every matching subscriber, retries failed deliveries on a fixed schedule, and keeps a searchable event log so you can debug and redeliver.

## Core concepts

| Concept | ID prefix | Description |
|---|---|---|
| Project | `prj_` | An isolated workspace with its own API keys, subscribers, and event log. |
| Event | `evt_` | A single published message with a `type` and a JSON `payload`. |
| Subscriber | `sub_` | An HTTPS endpoint that receives deliveries for matching event types. |
| Delivery | `dlv_` | One event being sent to one subscriber, including all of its retry attempts. |

One event can produce many deliveries: if three subscribers are interested in `order.created`, publishing one `order.created` event creates three independent deliveries.

## Creating an account

Sign up at dashboard.loopwire.dev. Every new account starts on the **Free** plan and is assigned a default project called `default`. You can create additional projects from the dashboard sidebar; each project has its own API keys and event log.

The Free plan allows up to 2 projects, 5 subscribers per project, and 3 team members. Growth raises these to 10 projects, 50 subscribers per project, and 10 team members; Scale makes projects and team members unlimited and allows 500 subscribers per project. See the Billing & Pricing Tiers guide for prices.

Projects are created in the US region by default. Scale-plan accounts can create projects in the EU region (`https://api.eu.loopwire.dev/v1`). The region is chosen at project creation and cannot be changed later, so decide before you start sending production traffic.

## Getting an API key

Open **Project Settings > API Keys** and create a key. You will see the full key exactly once, so copy it straight into your secrets manager or `.env` file. Use a `lw_test_...` key while you follow this guide; test-mode events are routed to the built-in test inbox and never count against your quota.

```
export LOOPWIRE_API_KEY=lw_test_xxxxxxxxxxxxxxxx
```

## Sending your first event

To publish an event, send a POST request to `https://api.loopwire.dev/v1/events` with a JSON body containing `type` (the event name) and `payload` (the event data). Include your API key in the `Authorization: Bearer <key>` header.

```
POST /v1/events
Authorization: Bearer lw_live_xxx
{
  "type": "order.created",
  "payload": { "orderId": "ord_123", "amount": 4200 }
}
```

A successful call returns `202 Accepted` with an `eventId`. Delivery to subscribers happens asynchronously, typically within 500ms.

The same request with curl:

```
curl -X POST https://api.loopwire.dev/v1/events \
  -H "Authorization: Bearer $LOOPWIRE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"order.created","payload":{"orderId":"ord_123","amount":4200}}'
```

And with the official Node SDK (`@loopwire/node`):

```js
import { Loopwire } from '@loopwire/node';

const loopwire = new Loopwire({ apiKey: process.env.LOOPWIRE_API_KEY });
const { eventId } = await loopwire.events.publish({
  type: 'order.created',
  payload: { orderId: 'ord_123', amount: 4200 },
});
console.log(eventId); // evt_...
```

The SDKs automatically retry `429` and `500` responses with exponential backoff (max 5 attempts, honoring `Retry-After`). Official SDKs are also available for Python (`loopwire`) and Go (`github.com/loopwire/loopwire-go`).

### Event type naming

Event types must be lowercase and dot-separated in `resource.action` form, matching `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, with a maximum of 64 characters. `order.created` and `invoice.payment_failed` are valid; `OrderCreated`, `order`, and `order-created` are rejected with `400 Bad Request`.

### What `202 Accepted` means

`202` means Loopwire has durably accepted the event and it counts toward your monthly quota. It does not mean any subscriber has received it yet. To see delivery progress, look up the event in the dashboard's Event Log. Each delivery moves through the statuses `pending`, `delivered`, `retrying`, `failed`, or `skipped` (for subscribers that were paused when the event was published).

## Adding a subscriber

Subscribers are HTTPS endpoints that receive events. Add one from the dashboard under **Subscribers > Add Endpoint**, or via the API with `POST /v1/subscribers`. Each subscriber can filter which event types it receives.

```
POST /v1/subscribers
Authorization: Bearer lw_test_xxx
{
  "url": "https://example.com/webhooks/loopwire",
  "eventTypes": ["order.created", "order.shipped"]
}
```

The response includes the subscriber ID (`sub_...`) and its signing secret (`whsec_...`). Store the signing secret; your endpoint uses it to verify the `Loopwire-Signature` header on every delivery.

## Testing locally

You don't need a public URL to develop. With a `lw_test_...` key, events go to the test inbox in the dashboard. To forward them to a local server, install the CLI (`npm install -g @loopwire/cli`) and run:

```
loopwire listen --forward-to http://localhost:3000/webhooks
```

## Quick checklist before going live

1. Create a `lw_live_...` key and store it in a secrets manager.
2. Point a production subscriber at an HTTPS URL that responds `2xx` within 10 seconds.
3. Verify `Loopwire-Signature` on every delivery.
4. Handle `429` (rate limit) and `402` (quota exceeded) responses in your publisher.
5. Check your plan's rate limit and monthly quota against expected traffic.

## Common first-day mistakes

- **Using a test key against production subscribers.** Test keys route to the test inbox only, so real endpoints never receive the events.
- **Doing slow work before responding.** If your handler takes longer than 10 seconds, the delivery counts as failed and is retried. Acknowledge quickly, then process asynchronously.
- **Assuming ordering.** Events can arrive out of order; use the `timestamp` field in the delivery body.

## Next steps

Once your first event delivers successfully, review the Authentication guide to rotate your key, the Rate Limits guide to understand plan quotas, and the Webhooks Overview to configure retry behavior.
