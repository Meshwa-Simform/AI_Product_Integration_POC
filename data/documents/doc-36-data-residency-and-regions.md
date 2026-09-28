# Data Residency & Regions

Loopwire runs in two regions. The region determines where your project's event payloads, delivery metadata, and subscriber configuration are stored and processed.

| Region | API base URL | Available on |
|---|---|---|
| US (default) | `https://api.loopwire.dev/v1` | All plans |
| EU | `https://api.eu.loopwire.dev/v1` | Scale plan only |

The US region is hosted in the United States; the EU region is hosted in Frankfurt, Germany, with a failover site in Dublin, Ireland. EU-region data does not leave the EU in normal operation or during failover.

## Choosing a region

The region is chosen **when a project is created** and **cannot be changed later**. In the dashboard, the region selector appears in the **New Project** dialog. Via the API:

```
POST /v1/projects
{
  "name": "acme-eu-prod",
  "region": "eu"
}
```

Valid values are `us` and `eu`. Requesting `eu` on a Free or Growth account returns `403 Forbidden` with error code `region_not_available_on_plan`.

A single account can have projects in both regions — for example, a US project for North American customers and an EU project for European customers.

## Using the right base URL

Each project only accepts requests on its own region's base URL. Sending a request for an EU project to `api.loopwire.dev` (or vice versa) returns `421 Misdirected Request` with an error body naming the correct base URL:

```
{
  "error": {
    "code": "wrong_region",
    "message": "This project is in region 'eu'. Use https://api.eu.loopwire.dev/v1."
  }
}
```

The official SDKs accept a `region` option (`region: "eu"`) and pick the correct base URL automatically. The API key itself does not encode the region, so if you hard-code a base URL, make sure it matches the project.

## What stays in the region

For an EU project, the following are stored and processed only in the EU:

- Event payloads (for the retention window: 30 days on Free/Growth, 90 days on Scale — EU projects are always Scale, so 90 days)
- Delivery attempts and delivery metadata
- Subscriber configuration and signing secrets
- The project's event log and search index

### What is global

Some account-level data is stored in the US regardless of project region:

- Account and team member profiles (names, emails, roles)
- Billing information (processed by Stripe)
- The account audit log

If your compliance requirements forbid storing team member emails outside the EU, consult your legal team before relying on EU-region projects alone.

## Delivery source IPs

Deliveries from EU projects originate from EU IP ranges; deliveries from US projects originate from US ranges. The full list for both regions is published at `https://api.loopwire.dev/v1/ips`, with each range tagged `us` or `eu`. If your subscriber endpoint uses a firewall allowlist, include the ranges for the region(s) you use. See Network Security & IP Ranges.

## Moving a project to another region

Because the region is permanent, migration means creating a new project:

1. Upgrade to Scale if moving to EU.
2. Create a new project with `region: "eu"`.
3. Recreate subscribers (new signing secrets are generated — update your endpoints' verification).
4. Create new API keys and deploy them to your publishers along with the new base URL.
5. Once traffic has fully moved, delete the old project.

Event history does not migrate. Events still pending retry in the old project continue their retry schedule there until you delete it.

## Downgrading with EU projects

You cannot downgrade from Scale while the account has any EU-region projects; the downgrade request is blocked with a message listing them. Delete or migrate those projects first.

## Gotchas

- The dashboard URL is the same (`dashboard.loopwire.dev`) for both regions; only the API base URL differs.
- Latency: publishers far from a region will see higher request latency, but delivery timing (retry schedule, 10-second timeout) is identical in both regions.
- Status is reported per region on status.loopwire.dev.
