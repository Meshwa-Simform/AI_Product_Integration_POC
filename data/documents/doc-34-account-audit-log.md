# Account Audit Log

The account audit log records administrative and security-relevant actions taken in your Loopwire account: who did what, when, and from where. It is separate from the **Event Log**, which records the events you publish and their deliveries.

## Availability and retention

| Plan | Audit log | Retention |
|---|---|---|
| Free | Not available | — |
| Growth | Available | 90 days |
| Scale | Available | 1 year |

Entries older than the retention period are permanently deleted. If you downgrade from Scale to Growth, entries older than 90 days are deleted at the start of the next billing cycle. If you downgrade to Free, the audit log becomes inaccessible and all entries are deleted.

## What gets logged

| Category | Example actions |
|---|---|
| API keys | `api_key.created`, `api_key.revoked`, `api_key.scope_changed` |
| Subscribers | `subscriber.created`, `subscriber.updated`, `subscriber.paused`, `subscriber.resumed`, `subscriber.deleted`, `subscriber.secret_rotated` |
| Members | `member.invited`, `member.joined`, `member.role_changed`, `member.removed`, `account.ownership_transferred` |
| Projects | `project.created`, `project.renamed`, `project.deleted`, `project.api_version_changed` |
| Security | `sso.enabled`, `sso.enforcement_changed`, `scim.token_generated`, `network.allowlist_changed` |
| Billing | `billing.plan_changed`, `billing.payment_method_updated` |
| Sign-in | `session.login_succeeded`, `session.login_failed` |

Not logged: individual event publishes and deliveries (those are in the Event Log), and read-only dashboard page views.

## Entry format

Each entry contains:

```
{
  "id": "aud_4Tq9...",
  "action": "api_key.revoked",
  "actor": { "type": "member", "email": "ana@example.com", "role": "admin" },
  "projectId": "prj_8fK2mQ",
  "target": { "type": "api_key", "id": "key_...", "last4": "9f3a" },
  "ipAddress": "203.0.113.24",
  "userAgent": "Mozilla/5.0 ...",
  "timestamp": "2026-03-02T14:11:09Z"
}
```

`actor.type` is one of `member`, `api_key` (the action was performed through the API with a key), `scim` (performed by your identity provider), or `system` (performed by Loopwire, e.g. suspension after a failed payment). Full API key values and signing secrets are never written to the audit log — only the last 4 characters.

## Viewing the audit log

In the dashboard: **Account Settings > Audit Log**. You can filter by action, actor, project, and date range. Only the Owner and Admins can view the audit log; Developers and Viewers cannot.

## Audit log API

```
GET /v1/audit-logs?action=api_key.revoked&limit=50
Authorization: Bearer lw_live_xxx
```

Query parameters:

- `action` — exact action name or a prefix ending in `.*` (e.g. `member.*`).
- `actor_email` — filter by member email.
- `project_id` — filter by project.
- `created_after`, `created_before` — ISO-8601 timestamps.
- `limit` (default 20, max 100) and `starting_after` for cursor pagination.

Responses follow the standard list format (`data`, `has_more`, `next_cursor`). The request must use an unscoped key; keys scoped to a single event type receive `403 Forbidden`.

## Exporting

Scale-plan accounts can enable a daily export of audit log entries as newline-delimited JSON to an S3 bucket or Google Cloud Storage bucket under **Audit Log > Export**. Exports run at 02:00 UTC and contain the previous UTC day's entries. Exported files are not deleted by Loopwire when the in-app retention window expires, so you can keep a longer history yourself.

## Common uses

- **Offboarding reviews** — list all `api_key.*` actions by a departing member to decide which keys to rotate.
- **Incident investigation** — check `subscriber.updated` and `subscriber.paused` entries when deliveries unexpectedly stop.
- **Compliance evidence** — auditors typically request access-change history (`member.*`) for SOC 2 reviews.

## Gotchas

- Audit log entries cannot be edited or deleted by anyone, including the Owner.
- Entries appear within 30 seconds of the action.
- Failed sign-ins are logged with the attempted email even if no such member exists.
