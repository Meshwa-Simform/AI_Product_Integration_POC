# Authentication & API Keys

Every request to the Loopwire API must include an API key in the `Authorization` header, using the format `Authorization: Bearer <key>`.

```
curl https://api.loopwire.dev/v1/usage \
  -H "Authorization: Bearer lw_live_xxxxxxxxxxxxxxxx"
```

Requests with no `Authorization` header, a malformed header (for example `Authorization: lw_live_...` without `Bearer`), an unknown key, or a revoked key are rejected with `401 Unauthorized`. A valid key that lacks the scope for an action gets `403 Forbidden` instead.

## Key types

There are two key prefixes:

- `lw_live_...` — production keys, used against real subscriber endpoints.
- `lw_test_...` — sandbox keys, used against the Loopwire test inbox instead of real subscribers. Test-mode events never count against your plan's event quota.

| | `lw_live_` | `lw_test_` |
|---|---|---|
| Delivers to real subscriber URLs | Yes | No — test inbox only |
| Counts toward monthly event quota | Yes | No |
| Subject to rate limits | Yes | Yes |
| Recommended for | Production | Local development and CI |

Live and test data are fully separated: events published with a test key never appear in the live Event Log, and vice versa.

## Creating and rotating keys

Keys are managed under **Project Settings > API Keys**. You can have up to 5 active keys per project at once. When you create a new key, the old one is not revoked automatically — you must explicitly revoke it. This lets you rotate keys without downtime: create the new key, deploy it to your services, confirm traffic has moved over, then revoke the old key.

Only Owners and Admins can create or revoke keys. Developers and Viewers can see the list of keys (name, prefix, last 4 characters, and last-used time) but not manage them.

### Zero-downtime rotation, step by step

1. **Create** a new key in **Project Settings > API Keys** (or `POST /v1/keys`). Give it a descriptive name such as `orders-service-2026-q3`.
2. **Deploy** the new key to every service that publishes events, usually by updating the secret in your secrets manager and restarting or reloading.
3. **Confirm** traffic has moved over: in the key list, the old key's "last used" timestamp should stop advancing and the new key's should be current.
4. **Revoke** the old key.

Do not revoke the old key immediately after creating the new one. Any service still using the old key will start receiving `401 Unauthorized` right away.

If you already have 5 active keys, creating a sixth fails with `400 Bad Request`. Revoke an unused key first.

If you revoke a key while requests are in flight using it, in-flight requests already accepted (returned `202`) will still complete delivery; only new requests using the revoked key will be rejected with `401 Unauthorized`.

Revocation takes effect within a few seconds across all regions and cannot be undone. A revoked key cannot be reactivated; create a new one instead.

## Scoping

Keys can optionally be scoped to a single event type or restricted to read-only access (for listing events, not publishing them). Scoped keys are created via `POST /v1/keys` with a `scope` field.

```
POST /v1/keys
Authorization: Bearer lw_live_admin_key
{
  "name": "billing-service",
  "scope": { "eventType": "invoice.paid" }
}
```

```
POST /v1/keys
{
  "name": "analytics-readonly",
  "scope": { "access": "read_only" }
}
```

Scope behavior:

- A key scoped to `invoice.paid` can publish only `invoice.paid` events. Publishing any other type returns `403 Forbidden`.
- A `read_only` key can list and fetch events, deliveries, and usage, but any publish or subscriber change returns `403 Forbidden`.
- Scopes are fixed at creation. To change a key's scope, create a new scoped key and rotate as described above.

Scoped keys are a good way to limit the damage if a single service's credentials leak.

## Using keys from code

The official SDKs read the key from the constructor:

```js
import { Loopwire } from '@loopwire/node';
const loopwire = new Loopwire({ apiKey: process.env.LOOPWIRE_API_KEY });
```

```python
import os
import loopwire
client = loopwire.Client(api_key=os.environ["LOOPWIRE_API_KEY"])
```

Never put a key in browser or mobile client code. All publishing should happen from your backend.

## Lost keys

Loopwire never displays a full key again after creation — only the last 4 characters are shown in the dashboard. If you lose a key, revoke it and create a new one; there is no recovery flow.

## Suspected leaks

If a key may have been exposed (committed to a public repo, pasted into a ticket, or found in logs):

1. Create a replacement key and deploy it.
2. Revoke the exposed key immediately, even if that causes a brief period of `401`s for services you haven't updated yet.
3. Review the Event Log for unexpected event types or volumes published during the exposure window.
4. On Growth and Scale, check the account audit log for key creation or subscriber changes you don't recognize.

## Troubleshooting authentication

| Symptom | Likely cause |
|---|---|
| `401` on every request | Missing `Bearer ` prefix, whitespace or newline in the key, or the key was revoked |
| `401` only from one service | That service still uses an old, revoked key |
| `403` on publish with a valid key | Key is scoped to a different event type or is `read_only`, or the project is suspended |
| Events never reach real subscribers | You're using a `lw_test_...` key |
