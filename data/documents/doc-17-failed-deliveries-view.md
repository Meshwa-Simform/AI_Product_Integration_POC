# Failed Deliveries View

The **Failed Deliveries** view (dashboard sidebar → **Deliveries > Failed**) lists every delivery that has exhausted its retries: the original attempt plus all 5 retries (at 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours) failed. It's where you diagnose broken endpoints and recover the events they missed.

## What appears here

A delivery shows up in this view when its status becomes `failed`. Deliveries that are still `retrying` are not listed (use the Event Log's **Has retrying deliveries** filter for those), and `skipped` deliveries from paused subscribers never appear here because they were never attempted.

Each row shows:

- Event ID (`evt_...`), event type and publish time.
- Subscriber (`sub_...`, description and URL).
- **Failure reason** for the last attempt: `timeout` (no response within 10 seconds), `connection_refused`, `dns_error`, `tls_error`, or `non_2xx` with the status code.
- Time of the final attempt and the total attempt count (always 6 for a delivery that failed naturally).

Opening a row shows every attempt with its request headers, response status, the first 1KB of the response body, and latency.

Failed deliveries remain in the view until they are redelivered successfully or the event leaves the retention window (30 days on Free/Growth, 90 days on Scale). After that, the payload is deleted and the delivery can no longer be recovered.

## Redelivering from the view

- **Single**: click **Redeliver** on a row.
- **Bulk**: select rows (or **Select all matching filter**) and click **Redeliver selected**. A single bulk action can include up to **500** deliveries; larger selections are rejected and you should narrow the filter or use a replay instead.

Redelivery resets the retry counter, so each redelivered delivery gets a full new sequence of 6 attempts. It does not count toward your monthly event quota. Successful redeliveries disappear from the view and the event gets a `redelivered` tag in the Event Log.

Tip: fix the endpoint first. Use **Send test event** on the subscriber page (which sends a `loopwire.test` ping) to confirm it returns `2xx` before bulk-redelivering, or the redelivered events will just fail again 12 hours later.

## Filters

- Subscriber
- Event type (exact or wildcard such as `order.*`)
- Failure reason
- Date range of the final attempt

The API equivalent is `GET /v1/events/{eventId}/deliveries` per event; there is no single API endpoint listing all failed deliveries across events, so for automation use failure notifications (below) instead.

## Failure notifications

Project Owners and Admins can enable **Notify on failed deliveries** under **Project Settings > Notifications**:

- **Email**: a digest at most once per hour per subscriber, listing how many deliveries failed and the most common failure reason.
- **Alert webhook**: Loopwire publishes a platform event of type `loopwire.delivery.failed` to a separate URL you configure, one per failed delivery, containing `eventId`, `deliveryId`, `subscriberId` and `failureReason`. Alert webhooks are not counted toward your quota and are not themselves retried.

Point the alert webhook at a different service from the failing endpoint — otherwise you won't hear about outages of that endpoint.

## Common failure reasons and fixes

| Reason | Typical cause | Fix |
|---|---|---|
| `timeout` | Endpoint does heavy work before responding. | Return `2xx` immediately and process asynchronously (e.g. push to a queue). |
| `non_2xx` 401/403 | Endpoint's auth middleware rejects Loopwire. | Exempt the webhook route from user auth; rely on signature verification instead. |
| `non_2xx` 301/302 | URL changed or HTTP→HTTPS redirect. | Update the subscriber URL; Loopwire doesn't follow redirects. |
| `tls_error` | Expired or self-signed certificate. | Use a valid certificate from a public CA. |
| `connection_refused` | Firewall blocking Loopwire. | Allow the delivery IP ranges published at `https://api.loopwire.dev/v1/ips`. |

## Gotchas

- Deleting a subscriber removes its failed deliveries from the view; they can't be redelivered to a new subscriber, but you can replay the time range to the new one.
- A suspended project (failed payment past the 7-day grace period) can view failed deliveries but cannot redeliver them.
