# Signing Secret Rotation

Every subscriber has its own **signing secret**, used to compute the `Loopwire-Signature` header on each delivery. Signing secrets start with `whsec_`. This guide explains how to rotate a signing secret without dropping or rejecting deliveries.

## When to rotate

- A secret was exposed (committed to a repo, printed in logs, shared in chat).
- A team member with access to the secret left.
- Your security policy requires periodic rotation (many teams rotate every 90 days).

## How rotation works

When you rotate a subscriber's secret, Loopwire generates a new secret and **keeps the old one valid for 24 hours**. During that 24-hour overlap window, every delivery's `Loopwire-Signature` header contains **two comma-separated signatures**: the signature with the **new** secret first, then the signature with the old secret.

```
Loopwire-Signature: 5f2b9c...e1a0,9a7d41...03bc
```

After 24 hours, the old secret expires and the header contains only the new signature again.

Rotation does not change the subscriber ID, URL, event filters, or any pending retries. Retries of events originally attempted before the rotation are signed with whichever secrets are valid at the time of the retry attempt.

## Rotating from the dashboard

Go to **Subscribers > Endpoint > Signing Secret > Rotate**. The new secret is displayed immediately and remains re-viewable in the same place. The old secret is shown with its expiry time until it expires.

## Rotating via the API

```
POST /v1/subscribers/{subscriberId}/rotate-secret
Authorization: Bearer lw_live_xxx
```

Response:

```
{
  "subscriberId": "sub_91Hc...",
  "secret": "whsec_new...",
  "previousSecretExpiresAt": "2026-04-11T09:30:00Z"
}
```

Optional body: `{ "expireCurrentSecretIn": 0 }` expires the old secret **immediately** (value in seconds, from 0 up to 86400). Use `0` only for a confirmed compromise — any endpoint still verifying with the old secret will start rejecting deliveries right away.

Only Owners, Admins, and Developers can rotate secrets. Each rotation is recorded in the account audit log as `subscriber.secret_rotated` (Growth and Scale).

## Zero-downtime rotation steps

1. **Update your verifier to accept multiple signatures** (see code below). Deploy this first — it's harmless before rotation because the header contains one signature.
2. **Rotate** the secret in Loopwire.
3. **Deploy the new secret** to your endpoint's configuration, within 24 hours.
4. After deployment, wait for the old secret to expire, then remove it from your configuration.

If step 3 isn't completed within 24 hours, your endpoint (still using the old secret) will start rejecting deliveries. Those deliveries count as failures and follow the normal retry schedule, so fixing the secret within the next ~14 hours still lets the retries succeed; after the final retry, events are marked `failed` and need manual redelivery.

## Verifying with multiple signatures (Node.js)

```js
import crypto from 'crypto';

export function verify(rawBody, header, secrets) {
  const received = header.split(',').map((s) => s.trim());
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return received.some(
      (sig) => sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
    );
  });
}
```

Pass both your current and new secrets during the transition. The official SDKs' `verifySignature()` already handles comma-separated signatures and accepts an array of secrets.

## Python equivalent

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, secrets: list[str]) -> bool:
    received = [s.strip() for s in header.split(",")]
    for secret in secrets:
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if any(hmac.compare_digest(sig, expected) for sig in received):
            return True
    return False
```

## Common mistakes

- **Verifying against a parsed/re-serialized body.** Always HMAC the raw bytes exactly as received; re-serializing JSON changes whitespace and key order.
- **Only checking the first signature.** During rotation, the first signature uses the *new* secret. An endpoint still on the old secret must check the second one.
- **Rotating twice within 24 hours.** A second rotation immediately expires the oldest secret; only the two most recent secrets are ever valid.
- **Confusing signing secrets with API keys.** API keys (`lw_live_`/`lw_test_`) authenticate your requests to Loopwire; signing secrets (`whsec_`) let your endpoint verify Loopwire's requests to you. Rotating one does not affect the other.
