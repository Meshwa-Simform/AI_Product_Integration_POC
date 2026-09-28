# Signature Verification Code Samples

Every delivery includes a `Loopwire-Signature` header containing the hex-encoded HMAC-SHA256 of the **raw request body**, keyed with the subscriber's signing secret (`whsec_...`). This page shows how to verify it correctly in several languages. The official SDKs expose a ready-made `verifySignature()` / `verify_signature()` / `VerifySignature()`; use these samples when you can't use an SDK.

## The algorithm

1. Read the raw request body bytes **before** any JSON parsing.
2. Compute `HMAC-SHA256(signing_secret, raw_body)` and hex-encode it (lowercase).
3. Split the `Loopwire-Signature` header on commas. Normally there is one value; during a signing-secret rotation there are two (new secret first), for 24 hours.
4. Compare your computed value to each header value using a **constant-time** comparison. Accept if any matches.
5. Otherwise respond `400` (or `401`) and do not process the event.

The full signing secret string, including the `whsec_` prefix, is the HMAC key.

## Node.js (no SDK)

```js
import crypto from 'node:crypto';

export function verify(rawBody, header, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return (header ?? '').split(',').some((sig) => {
    const a = Buffer.from(sig.trim(), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

With Express, mount `express.raw({ type: 'application/json' })` on the webhook route so `req.body` is a `Buffer`. With Next.js route handlers, use `await request.text()`. The length check matters: `timingSafeEqual` throws if buffers differ in length.

## Python (no SDK)

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig.strip()) for sig in header.split(","))
```

Raw body: Flask `request.get_data()`, Django `request.body`, FastAPI `await request.body()`.

## Go (no SDK)

```go
func verify(body []byte, header, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := []byte(hex.EncodeToString(mac.Sum(nil)))
    for _, sig := range strings.Split(header, ",") {
        if hmac.Equal(expected, []byte(strings.TrimSpace(sig))) {
            return true
        }
    }
    return false
}
```

## Ruby

```ruby
require "openssl"

def verify(raw_body, header, secret)
  expected = OpenSSL::HMAC.hexdigest("SHA256", secret, raw_body)
  header.to_s.split(",").any? { |sig| Rack::Utils.secure_compare(expected, sig.strip) }
end
```

In Rails use `request.raw_post`.

## PHP

```php
function verify(string $rawBody, string $header, string $secret): bool {
    $expected = hash_hmac('sha256', $rawBody, $secret);
    foreach (explode(',', $header) as $sig) {
        if (hash_equals($expected, trim($sig))) return true;
    }
    return false;
}
// $rawBody = file_get_contents('php://input');
```

## Replay protection

The signature covers the body only; `Loopwire-Timestamp` is not part of the signed content. To defend against replayed requests:

- Deduplicate on `Loopwire-Event-Id` (or the `eventId` field in the body). Store processed IDs for at least the 12-hour span of the retry schedule — longer if you use manual redelivery.
- Optionally reject deliveries whose `Loopwire-Timestamp` is more than a few minutes old, but note that retries are genuine re-sends: a retry's timestamp reflects the retry attempt, not the original publish time.

Deduplicating is also necessary for correctness, because a retry can arrive after your endpoint processed an attempt it then failed to acknowledge in time.

## Common mistakes

| Symptom | Cause |
|---|---|
| Every signature fails | Verifying against re-serialized JSON (`JSON.stringify(req.body)`) instead of raw bytes. |
| Fails only in production | A proxy or framework middleware is decompressing, re-encoding, or trimming the body. |
| Fails right after rotating the secret | Code only checks the first header value, or the new secret hasn't been deployed yet — both values are valid for 24 hours. |
| Fails locally with `loopwire listen` | Using the subscriber's secret instead of the session secret printed by the CLI. |
| Intermittent crash in Node | `timingSafeEqual` called on buffers of different lengths. |

Never use `==` / `===` string comparison for signatures; it leaks timing information.
