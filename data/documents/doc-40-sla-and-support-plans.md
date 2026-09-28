# SLA & Support Plans

This page describes Loopwire's uptime commitments and the support you get on each plan.

## Uptime SLA

| Plan | Monthly API uptime commitment | Approx. allowed downtime per 30-day month |
|---|---|---|
| Free | No SLA | — |
| Growth | 99.9% | ~43 minutes |
| Scale | 99.95% | ~22 minutes |

### How uptime is measured

- Uptime is measured per calendar month, per region, for the **Publish API** and **Management API** components shown on status.loopwire.dev.
- A minute counts as downtime when more than 5% of valid requests in that region fail with a `5xx` status or time out.
- Monthly uptime = (total minutes − downtime minutes) ÷ total minutes.

### What is excluded

- Scheduled maintenance announced at least 72 hours in advance on the status page.
- Errors caused by your own limits or configuration: `4xx` responses including `401`, `402`, `403`, and `429`.
- Failures of your subscriber endpoints (non-2xx responses or exceeding the 10-second timeout).
- Issues caused by your network, DNS, or IP allowlist settings.
- The dashboard and test inbox, which are not covered by the SLA.

### Delivery timing

The SLA covers API availability, not end-to-end delivery latency. Deliveries typically happen within 500ms of publishing, but this is a typical figure, not a guarantee. Loopwire also does not guarantee delivery order (see Frequently Asked Questions).

## Support plans

| | Free | Growth | Scale |
|---|---|---|---|
| Channel | Community forum (community.loopwire.dev) | Email (support@loopwire.dev) | Email + shared Slack channel |
| First response target | Best effort | 1 business day | 4 hours, 24/7 |
| Hours | — | Business days | 24/7 |
| Named technical contact | No | No | Yes |
| Custom security questionnaires | No | No | Yes |

"Business day" means Monday–Friday, excluding public holidays, in the time zone of the account's billing address. First response means a human reply acknowledging the issue, not necessarily a resolution.

### Severity levels (Scale)

Scale customers can tag tickets with a severity to prioritize them:

- **Sev 1** — production publishing or delivery is down. Engineering on-call is paged.
- **Sev 2** — significant degradation (elevated errors or delays) with a workaround available.
- **Sev 3** — general questions, feature requests, and non-urgent issues.

All severities share the 4-hour first-response target; Sev 1 tickets are typically answered much faster.

## Writing a good support request

Include:

- Project ID (`prj_...`) and region (US or EU).
- The affected event, subscriber, or delivery IDs (`evt_...`, `sub_...`, `dlv_...`).
- Timestamps in UTC and the HTTP status codes and `error.code` values you received.
- What you expected vs. what happened.

Never include full API keys or signing secrets in a support request — the last 4 characters are enough for Loopwire to identify a key.

## Changing plans

Upgrading takes effect immediately and your new support level applies to tickets opened after the upgrade. Downgrading takes effect at the start of the next billing cycle; you keep your current plan's SLA and support level until then. See Billing & Pricing Tiers for plan prices.

## Enterprise

Accounts above 10M events/month can negotiate custom SLAs and dedicated delivery infrastructure through sales@loopwire.dev.

## Gotchas

- Free-plan accounts have no SLA even when the status page shows an outage.
- Growth-plan support does not include weekends — for weekend coverage, you need Scale.
- An incident in the EU region does not count against US-region uptime, and vice versa.
