# Troubleshooting Authentication Errors

This guide covers `401 Unauthorized` and `403 Forbidden` responses from the Loopwire API: what triggers each one and how to fix it.

## 401 vs 403 at a glance

| Status | Meaning | Typical fix |
|---|---|---|
| `401 Unauthorized` | Loopwire could not authenticate the request: the key is missing, invalid, or revoked | Send a valid, active key in the correct header format |
| `403 Forbidden` | The key is valid, but the request is not allowed | Check the key's scope, the project's suspension status, or IP allowlisting |

Neither error is retryable. The Loopwire SDKs only auto-retry `429` and `500`. Retrying a `401` or `403` with the same key and settings will fail every time.

All errors use the standard body `{ "error": { "code": "...", "message": "..." } }`. The `code` field tells you which cause applies.

## Diagnosing 401 Unauthorized

### Missing or malformed header

The header must be exactly:

```
Authorization: Bearer lw_live_xxxxxxxxxxxx
```

Common mistakes:

- Sending `Authorization: lw_live_...` without the `Bearer ` prefix.
- Sending the key in a custom header such as `X-Api-Key`, or as a query parameter.
- Stray whitespace or a trailing newline copied from a secrets file. Trim the value before building the header.
- An empty environment variable, which produces `Authorization: Bearer ` with nothing after it.

### Revoked key

Revoking a key takes effect immediately for new requests. Requests that were already accepted (returned `202`) before the revocation still complete delivery. Only requests sent after the revocation get `401`.

If you revoked the old key during a rotation before every service had switched to the new one, services still using the old key start failing with `401`. The correct rotation order is:

1. Create the new key. The old key is not revoked automatically.
2. Deploy the new key to every service.
3. Confirm in your logs or dashboard that traffic has moved to the new key.
4. Revoke the old key.

A project can have up to 5 active keys at once, so there is always room for an overlap period.

### Lost key

Loopwire never shows a full key again after it is created. The dashboard shows only the last 4 characters. There is no recovery flow. Revoke the lost key and create a new one.

### Wrong environment

A key belongs to one project. A key from a project in the EU region will not authenticate against a US-region project, and the reverse is also true. EU-region projects must call `https://api.eu.loopwire.dev/v1`.

## Diagnosing 403 Forbidden

### Key lacks scope

Keys can be scoped to a single event type or restricted to read-only access. A read-only key can list events but cannot publish. A key scoped to `order.created` gets `403` when it publishes `user.updated`. Check the key's scope under **Project Settings > API Keys**, or create a correctly scoped key with `POST /v1/keys`.

### Project suspended

If a payment fails, the project enters a 7-day grace period during which everything keeps working. After the grace period the project is suspended, and new publish requests are rejected with `403 Forbidden`. Subscriber configuration is preserved during suspension. Update the payment method under **Billing** to restore service.

### IP not allowlisted (Scale plan)

Scale-plan projects can restrict which source IPs may call `/v1/events` (**Project Settings > Network**). Requests from any other IP get `403` even with a valid key. This often happens after moving workloads to new infrastructure, autoscaling onto new NAT gateways, or running scripts from a laptop.

## Quick decision tree

1. Is the status `401`? Check the header format, then whether the key is revoked, then whether it belongs to the right project and region.
2. Is the status `403`? Check the key's scope, then the project's billing or suspension status, then the IP allowlist.
3. Did it work yesterday and fail today? Look at recent key revocations, billing emails, and infrastructure or IP changes.

## Gotchas

- **402 is not an auth error.** `402 Payment Required` means the monthly event quota is exhausted. See Troubleshooting Rate Limit & Quota Errors.
- **Test vs live:** `lw_test_...` keys authenticate normally but route events to the test inbox. A missing delivery is not an auth problem.
- **Client-side code:** if a key was ever shipped in browser or mobile code, treat it as compromised. Every Loopwire key has full publish access for its project. Revoke it and move publishing to your backend.
- **Webhook signature failures are not 401s.** When *your* endpoint rejects a Loopwire delivery because a signature does not match, that happens on your side. See Subscriber Endpoint Design and Security Best Practices.
