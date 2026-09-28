# Billing & Pricing Tiers

## Plans

| Plan | Price | Included events/month | Overage |
|---|---|---|---|
| Free | $0 | 10,000 | Not available — requests are blocked at 402 once quota is hit |
| Growth | $49/month | 250,000 | $0.20 per 1,000 additional events |
| Scale | $499/month | 2,000,000 | $0.10 per 1,000 additional events |

### What each plan includes

| Feature | Free | Growth | Scale |
|---|---|---|---|
| Rate limit (`/v1/events`) | 10 req/s, burst 20 | 50 req/s, burst 150 | 500 req/s, burst 1000 |
| Projects | 2 | 10 | Unlimited |
| Subscribers per project | 5 | 50 | 500 |
| Team members | 3 | 10 | Unlimited |
| Event retention | 30 days | 30 days | 90 days |
| Account audit log | — | 90 days | 1 year |
| IP allowlisting | — | — | Yes |
| EU region | — | — | Yes |
| SSO (SAML) and SCIM | — | — | Yes |
| API uptime SLA | None | 99.9% | 99.95% |
| Support | Community forum | Email, 1 business day | 4-hour response, 24/7, shared Slack |

## Overage on Growth

Growth overage is **opt-in** and turned off by default. With overage off, a Growth project behaves like Free once it passes 250,000 events: every publish returns `402 Payment Required` until you upgrade or the cycle resets. To enable overage, go to **Billing > Plan > Overage** (Owner only). Once enabled, events above 250,000 are accepted and billed at $0.20 per 1,000, rounded up to the next 1,000.

You can set a monthly overage cap in the same screen. When the cap is reached, publishing returns `402` again.

On Scale, overage above 2,000,000 events is always on and billed at $0.10 per 1,000. Scale has no hard quota block. This is what "unlimited" means in the Rate Limits & Quotas guide.

### Worked examples

- **Growth, overage off, 260,000 events attempted:** the first 250,000 are accepted. Everything after that is rejected with `402`. Cost: $49.
- **Growth, overage on, 300,000 events:** 50,000 overage events = 50 × $0.20 = $10. Cost: $59.
- **Scale, 3,500,000 events:** 1,500,000 overage events = 1,500 × $0.10 = $150. Cost: $649.
- **Growth, 260,000 events of which 20,000 were test-mode:** test events don't count, so 240,000 counted events. Cost: $49 with no overage.

## Billing cycle

Billing runs on a calendar-month cycle starting the day you upgrade. Event quota resets on the same day each month. Downgrading takes effect at the start of the next billing cycle — you keep your current plan's quota until then.

For example, if you upgrade to Growth on March 14, your cycle runs from the 14th of each month to the 13th of the next. Quota resets on the 14th. `GET /v1/usage` returns the exact reset timestamp in `resetsAt`.

### Upgrading

Upgrades take effect immediately. Your new rate limit and quota apply to the next request, and the new cycle starts on the upgrade date. If you upgrade because you hit `402`, publishing works again as soon as the upgrade completes.

### Downgrading

Downgrades are scheduled for the start of the next billing cycle. Before the downgrade takes effect, bring your project within the lower plan's limits:

- Projects above the new plan's limit are archived (read-only) rather than deleted.
- Subscribers above the per-project limit are paused, starting with the most recently created.
- Team members above the limit keep read-only access until an Owner removes them.
- On a downgrade from Scale, IP allowlisting is turned off and retention drops to 30 days for newly published events.

## Payment

Loopwire charges the card on file via Stripe on the 1st of each billing cycle. Invoices are available under **Billing > Invoices**, and failed payments trigger a 7-day grace period before the project is suspended (events are rejected with `403 Forbidden` during suspension, but existing subscriber configuration is preserved).

Here, "the 1st of each billing cycle" means the first day of your cycle (your upgrade anniversary day), not the calendar 1st. Overage from the previous cycle is charged on the same invoice.

### Failed payment timeline

| Day after failed charge | What happens |
|---|---|
| Day 0 | Charge fails. Owners get an email. Stripe retries the card automatically. |
| Days 1–7 | Grace period. Publishing and delivery continue normally. A banner shows in the dashboard. |
| Day 7 | If still unpaid, the project is suspended. `/v1/events` returns `403 Forbidden`. |
| During suspension | Subscribers, keys, and settings are preserved. Deliveries that are already queued continue. |
| After payment | The suspension lifts within a few minutes. Publishing resumes. Events rejected during suspension are not replayed. |

Update the card under **Billing > Payment Method**. Paying the open invoice there ends the grace period or suspension immediately.

## Who can manage billing

Only the Owner role can change plans, update payment methods, enable overage, or download invoices. Admins can view current usage but not billing settings.

## Enterprise

Custom volume pricing and dedicated delivery infrastructure are available above 10M events/month — contact sales@loopwire.dev.

Enterprise contracts can include annual invoicing, custom SLAs, and a dedicated support engineer. These are negotiated individually and are not available through the dashboard.
