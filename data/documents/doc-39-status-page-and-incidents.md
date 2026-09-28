# Status Page & Incidents

Loopwire publishes real-time service health at **status.loopwire.dev**. This page explains what the status page shows, how incidents are communicated, and how Loopwire's behavior during an incident affects your events.

## Components on the status page

Status is reported per region (US and EU) for these components:

| Component | What it covers |
|---|---|
| Publish API | `POST /v1/events`, `POST /v1/events/batch` |
| Management API | Subscribers, keys, usage, projects, audit log endpoints |
| Event Delivery | Outbound HTTP deliveries to subscriber endpoints |
| Dashboard | `dashboard.loopwire.dev` |
| Test Inbox | Delivery of `lw_test_` events to the dashboard inbox |

Each component shows one of: **Operational**, **Degraded Performance**, **Partial Outage**, **Major Outage**, or **Under Maintenance**. The page also shows 90 days of uptime history per component.

## Subscribing to updates

From status.loopwire.dev you can subscribe to incident updates by email, SMS, RSS/Atom feed, or webhook. You can subscribe to specific components and regions only — for example, just "Event Delivery (EU)".

Scale-plan customers are additionally notified in their shared Slack channel for incidents affecting their region.

## Incident lifecycle

Incidents move through these stages, each posted as an update on the status page:

1. **Investigating** — the issue is confirmed and being looked into. Loopwire aims to post the first update within 10 minutes of detection.
2. **Identified** — the cause is known and a fix is in progress.
3. **Monitoring** — a fix has been applied and results are being watched.
4. **Resolved** — the incident is over.

For major outages, a written post-incident review is published within 5 business days, describing the timeline, root cause, and follow-up actions.

## What happens to your events during an incident

### Publish API outages

If the Publish API is unavailable, your requests may fail with `500 Internal Server Error` or `503 Service Unavailable`, or time out. These are safe to retry: use exponential backoff and honor `Retry-After` if present (max 5 attempts, as described in Rate Limits & Quotas). Use an `idempotencyKey` so that a request which actually succeeded before the error is not published twice — retries with the same key and identical payload within 24 hours return the original `eventId`.

If you can't publish for longer than your retry budget, queue events on your side and publish them once the status page shows Operational.

### Delivery outages

Events accepted with `202 Accepted` are durably stored before the response is returned. If Event Delivery is degraded, deliveries are delayed rather than lost. When delivery resumes, the backlog is delivered — typically faster than normal, so make sure your endpoint can absorb a burst.

Delivery attempts that Loopwire could not make because of its own outage **do not consume** your subscriber's retry attempts. The retry schedule (original attempt + 5 retries) only counts attempts that actually reached, or tried to reach, your endpoint.

Because of the backlog, events may arrive out of order after an incident. Use the `timestamp` field in the payload to reconstruct order.

### Dashboard outages

The dashboard being down does not affect publishing or delivery. Use the API for any urgent management actions.

## Scheduled maintenance

Maintenance that could affect availability is announced on the status page at least 72 hours in advance, and scheduled outside 09:00–18:00 in the affected region's main business hours. Most maintenance causes no downtime.

## Reporting a problem

Before contacting support, check status.loopwire.dev. If no incident is posted and you're seeing elevated errors:

- Free: post in community.loopwire.dev.
- Growth: email support@loopwire.dev (first response within 1 business day).
- Scale: use your shared Slack channel or email support (4-hour first response, 24/7).

Include your project ID (`prj_...`), region, affected event or delivery IDs (`evt_...`, `dlv_...`), timestamps in UTC, and the HTTP status codes you received.

## Gotchas

- `429 Too Many Requests` and `402 Payment Required` are never caused by an incident — they reflect your own rate limit or quota.
- A `403` during an incident is not an incident symptom either; check for a suspended project or IP allowlist.
- SLA uptime (see SLA & Support Plans) is measured from the Publish API and Management API components.
