# Integrations: Slack, Datadog & PagerDuty

Loopwire can send alert notifications and delivery metrics to the tools your team already uses. Set up integrations under **Project Settings > Integrations**. Only Owners and Admins can add or remove integrations.

## Plan availability

| Integration | Free | Growth | Scale |
|---|---|---|---|
| Email alerts | Yes | Yes | Yes |
| Slack | Yes | Yes | Yes |
| Datadog | No | Yes | Yes |
| PagerDuty | No | Yes | Yes |
| Alert webhooks | No | Yes | Yes |

## Slack

### Setup

1. Go to **Project Settings > Integrations > Slack** and click **Connect**.
2. Authorize the Loopwire Slack app for your workspace.
3. Choose a default channel. Each alert rule can override it.

### What gets posted

- Alert triggered and resolved messages, including the rule name, subscriber, current value, and a link to the dashboard.
- Optionally, a daily digest at 09:00 in the project's time zone: events published, delivery success rate, and the number of new failed deliveries.

### Gotchas

- Private channels require inviting the Loopwire app into the channel first, with `/invite @Loopwire`.
- If the person who connected Slack leaves your Slack workspace, the connection keeps working, because it belongs to the workspace, not the user.
- Slack messages never contain event payloads, only metadata. This keeps payload data out of chat history.

## Datadog

### Setup

1. Create a Datadog API key in Datadog under **Organization Settings > API Keys**.
2. In Loopwire, go to **Project Settings > Integrations > Datadog**, paste the key, and choose your Datadog site (US1, US3, US5, EU1, or AP1).

### Metrics sent

Metrics are sent every 60 seconds and tagged with `project`, `subscriber`, and `event_type`:

| Metric | Type | Description |
|---|---|---|
| `loopwire.events.published` | count | Events accepted by `/v1/events` and `/v1/events/batch` |
| `loopwire.deliveries.attempted` | count | Delivery attempts, including retries |
| `loopwire.deliveries.succeeded` | count | Attempts that got a `2xx` within 10s |
| `loopwire.deliveries.failed` | count | Deliveries that reached status `failed` after 6 attempts |
| `loopwire.deliveries.response_time` | distribution | Subscriber response time in ms |
| `loopwire.quota.remaining` | gauge | Remaining monthly events |

Alert rules can also send events to the Datadog event stream.

### Example monitor

```
sum(last_15m):sum:loopwire.deliveries.failed{subscriber:sub_orders}.as_count() > 0
```

### Gotchas

- The `event_type` tag on high-volume projects with many distinct event types can increase your custom-metrics bill in Datadog. You can turn this tag off in the integration settings.
- Rotating your Datadog API key requires updating it in Loopwire. Metrics stop flowing, and nothing is backfilled, until you do.

## PagerDuty

### Setup

1. In PagerDuty, create a service with an **Events API v2** integration and copy its integration key.
2. In Loopwire, go to **Project Settings > Integrations > PagerDuty**, paste the key, and choose which alert rules page.

### Behavior

- A triggered alert opens a PagerDuty incident. A resolved alert resolves it automatically.
- The incident dedup key is the alert rule ID plus the subscriber ID, so a flapping subscriber updates one incident instead of opening dozens.
- Severity is set per alert rule: `critical`, `error`, `warning`, or `info`.

### What should page

Page only on things a human must fix quickly:

- Quota usage at 95% or more, because the next step is `402` and all publishing is blocked.
- A failure rate above 50% on revenue-critical subscribers.
- New failed deliveries on subscribers where a lost event means lost money.

Everything else belongs in Slack.

## Alert webhooks

For other tools such as Opsgenie, Microsoft Teams, or your own service, add an alert webhook URL (it must be HTTPS). Payloads use the event types `loopwire.alert.triggered` and `loopwire.alert.resolved`. They include `Loopwire-Signature` and are verified the same way as normal deliveries, using the signing secret shown when you create the alert webhook.

## Removing an integration

Removing an integration takes effect immediately. Alert rules that used it fall back to email notifications for the project's Owners and Admins, so alerts are never silently dropped.
