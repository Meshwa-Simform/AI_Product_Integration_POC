# Security Best Practices

This guide covers securing both directions of traffic: your publisher calling Loopwire, and Loopwire delivering to your subscriber endpoints.

## Verifying webhook signatures

Every event Loopwire delivers to your subscriber endpoint includes a `Loopwire-Signature` header: an HMAC-SHA256 signature of the raw request body, signed with your endpoint's signing secret (shown once when you create the subscriber, and re-viewable under **Subscribers > Endpoint > Signing Secret**).

To verify: compute `HMAC-SHA256(signing_secret, rawRequestBody)` and compare it to the header value using a constant-time comparison. Reject the request if they don't match — this confirms the event actually came from Loopwire and wasn't forged or tampered with in transit.

Signing secrets start with `whsec_`. The signature is hex-encoded.

### Node.js (Express)

```js
import crypto from 'crypto';
import express from 'express';

const app = express();

app.post('/webhooks/loopwire', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('Loopwire-Signature') ?? '';
  const expected = crypto.createHmac('sha256', process.env.LOOPWIRE_SIGNING_SECRET).update(req.body).digest('hex');
  const valid = header.split(',').some((sig) =>
    sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
  );
  if (!valid) return res.status(401).end();
  res.status(200).end();
  queue.push(JSON.parse(req.body));
});
```

### Python (Flask)

```python
import hmac, hashlib, os
from flask import Flask, request, abort

app = Flask(__name__)

@app.post("/webhooks/loopwire")
def webhook():
    secret = os.environ["LOOPWIRE_SIGNING_SECRET"].encode()
    expected = hmac.new(secret, request.get_data(), hashlib.sha256).hexdigest()
    sigs = request.headers.get("Loopwire-Signature", "").split(",")
    if not any(hmac.compare_digest(s, expected) for s in sigs):
        abort(401)
    return "", 200
```

The official SDKs provide a `verifySignature()` helper that does all of this for you.

### Common verification mistakes

- **Parsing the JSON before verifying.** Re-serialized JSON rarely matches the original bytes byte-for-byte. Always sign the raw body.
- **Using `==` to compare.** A normal string comparison leaks timing information. Use `crypto.timingSafeEqual` or `hmac.compare_digest`.
- **Mixing up secrets.** Each subscriber has its own signing secret. A secret from one endpoint won't verify deliveries to another.
- **Using an API key as the secret.** API keys (`lw_...`) authenticate you to Loopwire. Signing secrets (`whsec_...`) authenticate Loopwire to you.

### Replay protection

Each delivery also includes `Loopwire-Timestamp` (unix seconds) and `Loopwire-Event-Id`. To defend against replayed requests:

- Reject deliveries whose `Loopwire-Timestamp` is more than 5 minutes older than your server clock.
- Store processed `Loopwire-Event-Id` values and skip duplicates. Retries reuse the same event ID, so this also makes your handler idempotent.

### Rotating a signing secret

Rotate a secret from **Subscribers > Endpoint > Signing Secret > Rotate**. The old secret stays valid for 24 hours. During that window, `Loopwire-Signature` contains two comma-separated signatures, with the new one first. The code samples above accept either. Deploy the new secret to your endpoint within 24 hours. After that, only the new signature is sent.

## API key storage

Never commit API keys to source control or expose them in client-side code — unscoped Loopwire keys have full publish access for the project. Store keys in a secrets manager or environment variables. Use `lw_test_...` keys in local development and CI.

Additional recommendations:

- Give each service its own key so one key can be revoked without affecting other services.
- Use scoped keys (single event type or read-only) wherever a service doesn't need full access.
- Add a secret scanner to your CI to catch strings starting with `lw_live_` or `whsec_`.
- Rotate production keys on a regular schedule, for example every 90 days, using the zero-downtime process in Authentication & API Keys.

## Securing subscriber endpoints

- Subscriber URLs must use HTTPS. Loopwire delivers over TLS 1.2 or higher and rejects invalid certificates.
- Loopwire's delivery IP ranges are published at `https://api.loopwire.dev/v1/ips`. You can restrict your firewall to these ranges as a second layer, but always verify signatures as well.
- Don't include secrets in subscriber URLs (for example `?token=...`). URLs are visible to project members in the dashboard.

## IP allowlisting

Scale-plan projects can restrict which source IPs are allowed to call `/v1/events`, configured under **Project Settings > Network**. Requests from non-allowlisted IPs are rejected with `403 Forbidden` even with a valid key.

Allowlist entries accept single IPs or CIDR ranges. Add every egress IP your publishers use, including NAT gateways and CI runners, before enabling the list. Otherwise you'll lock out your own services.

## Data retention

Event payloads are retained for 30 days (Free/Growth) or 90 days (Scale) for debugging and redelivery, then permanently deleted. Loopwire does not log payload contents outside this retention window, only delivery metadata (timestamps, status codes, attempt counts).

Payloads are encrypted at rest with AES-256. Loopwire is SOC 2 Type II certified, and a GDPR Data Processing Agreement is available at loopwire.dev/legal/dpa.

Avoid putting sensitive personal data (passwords, full card numbers, government IDs) in event payloads. Send an identifier instead, and have the subscriber fetch the details from your API.

## Account security

- Enforce two-factor authentication for all team members under **Organization > Security**.
- Grant the least-privileged role: Viewer for read-only access, Developer for subscriber work. Reserve Admin and Owner for people who manage keys, members, or billing.
- Scale accounts can enforce SAML SSO and SCIM provisioning so access is removed automatically when someone leaves.
