# Network Security & IP Ranges

This page covers two directions of network control:

1. **Inbound to Loopwire** — restricting which IPs may call the Loopwire API (IP allowlisting).
2. **Outbound from Loopwire** — which IPs Loopwire uses to deliver events, so you can allow them through your subscriber endpoint's firewall.

## Inbound: IP allowlisting

IP allowlisting is available on the **Scale plan only** and is configured per project under **Project Settings > Network**.

- Add individual IPv4/IPv6 addresses or CIDR ranges (e.g. `198.51.100.0/24`), up to 100 entries per project.
- Once the list has at least one entry, requests to `/v1/events` from any IP not on the list are rejected with `403 Forbidden` — even if the API key is valid.
- An empty list means no restriction.

The allowlist applies to both live and test keys in the project. The dashboard is not affected by the allowlist; use SSO (Scale) to control dashboard access.

### Avoiding lockouts

Changes take effect within 60 seconds. Before enabling an allowlist, make sure you've included:

- The egress IPs of every service that publishes events (including NAT gateways and serverless egress IPs).
- CI runners, if CI publishes test events.

If you lock yourself out, an Owner or Admin can clear the list from the dashboard; the dashboard is never blocked by the allowlist. Every change is recorded in the account audit log as `network.allowlist_changed`.

### Error response

```
403 Forbidden
{
  "error": {
    "code": "ip_not_allowed",
    "message": "Requests from 203.0.113.9 are not allowed for this project."
  }
}
```

Note that `403` is also used for suspended projects and for keys lacking scope; check `error.code` to tell them apart. Retrying a `403` never helps.

## Outbound: delivery IP ranges

Loopwire delivers events from a fixed set of IP ranges. The current list is published as JSON at:

```
GET https://api.loopwire.dev/v1/ips
```

No authentication is required. Example response:

```
{
  "updatedAt": "2026-02-01T00:00:00Z",
  "ranges": [
    { "cidr": "192.0.2.0/26",   "region": "us" },
    { "cidr": "198.51.100.64/26", "region": "us" },
    { "cidr": "203.0.113.128/26", "region": "eu" }
  ]
}
```

Loopwire announces additions to the range list at least 14 days in advance via the changelog and email to account Owners. Your firewall automation should poll `/v1/ips` (daily is plenty) rather than hard-coding ranges.

### IP allowlisting is not authentication

Allowing Loopwire's IPs through your firewall reduces noise, but it does **not** prove a request came from your Loopwire project — other Loopwire customers' deliveries come from the same IPs. Always verify the `Loopwire-Signature` header (see Security Best Practices and Signing Secret Rotation).

## Transport security

- Subscriber endpoint URLs must use HTTPS. Plain `http://` URLs are rejected when creating a subscriber with `400 Bad Request`.
- Loopwire requires TLS 1.2 or higher when delivering and validates your certificate. Deliveries to endpoints with expired, self-signed, or hostname-mismatched certificates fail and follow the normal retry schedule (original attempt + 5 retries).
- The Loopwire API itself only accepts TLS 1.2+.

## Private networks

Loopwire cannot deliver to private IP addresses (RFC 1918 ranges such as `10.0.0.0/8`, `192.168.0.0/16`), loopback, or link-local addresses. Subscriber URLs whose hostname resolves to a private address fail delivery with error `destination_not_allowed`. For local development, use a test key with the test inbox, or `loopwire listen --forward-to http://localhost:3000/webhooks` from the Loopwire CLI.

## Recommended subscriber hardening checklist

1. Verify `Loopwire-Signature` on every request using a constant-time comparison.
2. Reject requests whose `Loopwire-Timestamp` is more than 5 minutes old to limit replay.
3. Optionally restrict source IPs to the ranges from `/v1/ips`.
4. Respond with `2xx` within 10 seconds; do heavy work asynchronously.
5. Deduplicate using `Loopwire-Event-Id`, since retries can deliver the same event more than once.
