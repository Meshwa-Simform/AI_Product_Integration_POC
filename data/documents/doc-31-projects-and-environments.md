# Projects & Environments

A **project** is the top-level container in Loopwire. Every project has its own API keys, subscribers, event log, usage counters, and settings. Nothing is shared between projects: an API key from one project cannot publish events into another, and a subscriber configured in project A never receives events published to project B.

Project IDs use the prefix `prj_` (for example `prj_8fK2mQ`). Every new account starts with one project called `default`.

## Project limits by plan

| Plan | Projects per account |
|---|---|
| Free | 2 |
| Growth | 10 |
| Scale | Unlimited |

If you try to create a project beyond your plan's limit, the dashboard disables the **New Project** button and `POST /v1/projects` returns `403 Forbidden` with error code `project_limit_reached`. Deleting a project frees its slot immediately.

## Live vs. test environments

Loopwire does not use separate "staging" and "production" projects by default. Instead, each project has two built-in environments selected by the API key you use:

- **Live** — requests made with `lw_live_...` keys. Events are delivered to your real subscriber endpoints and count against your monthly event quota.
- **Test** — requests made with `lw_test_...` keys. Events are routed to the project's built-in test inbox in the dashboard instead of real subscribers, and never count against your quota.

Both environments share the same project settings (pinned API version, region, network rules), but their event logs are shown separately in the dashboard using the **Live / Test** toggle at the top of the Event Log.

### When to use separate projects instead

Use a separate project, rather than just test keys, when you need:

- Different subscriber endpoints for a staging deployment that must receive *real* HTTP deliveries.
- Different team access (members are granted access per project — see Team Members & Roles).
- A different data region (see Data Residency & Regions).
- Independent usage tracking, for example one project per customer tenant.

A common layout is three projects: `myapp-dev`, `myapp-staging`, `myapp-prod`. Note that on the Free plan (2 projects) this layout isn't possible — use test keys for development and one project each for staging and production.

## Project settings

Project settings live under **Project Settings** in the dashboard sidebar:

- **General** — project name, project ID (read-only), region (read-only after creation).
- **API Keys** — create, scope, and revoke keys (up to 5 active per project).
- **API Version** — the pinned `Loopwire-Version` used when a request omits the header. New projects are pinned to the current version, `2026-01-15`.
- **Network** — IP allowlisting (Scale plan only).
- **Danger Zone** — rename or delete the project.

## Region is permanent

The data region (US by default, or EU on the Scale plan) is chosen when the project is created and cannot be changed afterwards. To move a project's workload to a different region, create a new project in the target region, recreate its subscribers and keys, switch your publishers over, then delete the old project. Event history does not move between projects.

## Creating a project via the API

```
POST /v1/projects
Authorization: Bearer lw_live_xxx
{
  "name": "myapp-staging",
  "region": "us"
}
```

The response includes the new `projectId`. Keys for the new project must then be created in that project; the key used to create the project cannot publish into it.

## Deleting a project

Only the account Owner or an Admin can delete a project. Deletion:

- Immediately revokes all of the project's API keys (new requests get `401 Unauthorized`).
- Stops all deliveries, including in-progress retries.
- Permanently deletes subscribers, signing secrets, and the event log.

Deletion is irreversible — there is no restore. To confirm, you must type the project name in the Danger Zone dialog.

## Usage and quotas are per account plan, tracked per project

Your monthly event quota belongs to your plan, and the usage of all live-environment events across all of your projects counts toward it. `GET /v1/usage` called with a project's key returns that project's usage plus the account's remaining quota, so you can see which project is consuming the most events.

## Gotchas

- Test events never count toward quota, but test requests *do* count toward the per-second rate limit for the project.
- Switching a key from test to live is not possible — create a new `lw_live_...` key instead.
- Subscriber limits (Free 5, Growth 50, Scale 500) apply per project, not per account.
