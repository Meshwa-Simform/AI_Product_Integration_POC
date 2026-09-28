# Go SDK

The official Go SDK lives at `github.com/loopwire/loopwire-go`. It is context-aware, safe for concurrent use, and retries rate-limited and server-error responses automatically.

## Requirements and installation

Go 1.21 or later.

```
go get github.com/loopwire/loopwire-go
```

## Creating a client

```go
import (
    "os"

    loopwire "github.com/loopwire/loopwire-go"
)

client, err := loopwire.NewClient(
    os.Getenv("LOOPWIRE_API_KEY"),
    loopwire.WithAPIVersion("2026-01-15"),
)
if err != nil {
    log.Fatal(err) // returned when the key is empty or malformed
}
```

Options:

| Option | Default |
|---|---|
| `WithBaseURL(url)` | `https://api.loopwire.dev/v1` (EU projects: `https://api.eu.loopwire.dev/v1`, Scale only) |
| `WithAPIVersion(v)` | project's pinned version |
| `WithMaxAttempts(n)` | `5` total attempts; values above 5 are clamped to 5 |
| `WithHTTPClient(c)` | `http.Client` with a 30s timeout |

A `*loopwire.Client` is safe to share across goroutines. Create it once at startup.

## Publishing events

```go
resp, err := client.Events.Publish(ctx, &loopwire.PublishParams{
    Type:           "order.created",
    Payload:        map[string]any{"orderId": "ord_123", "amount": 4200},
    IdempotencyKey: "order-ord_123-created",
})
if err != nil {
    return err
}
fmt.Println(resp.EventID) // evt_...
```

`Payload` accepts any value that `encoding/json` can marshal. The SDK checks the event type against `^[a-z0-9_]+(\.[a-z0-9_]+)+$` (max 64 chars) and the marshalled payload against the 256KB limit before sending, returning `loopwire.ErrValidation` wrapped with details.

Context cancellation and deadlines are respected, including during backoff sleeps: if `ctx` is cancelled while waiting to retry, `Publish` returns `ctx.Err()` immediately.

### Batch publishing

```go
res, err := client.Events.PublishBatch(ctx, []loopwire.PublishParams{
    {Type: "user.updated", Payload: map[string]any{"userId": "u_1"}},
    {Type: "user.updated", Payload: map[string]any{"userId": "u_2"}},
})
for _, r := range res.Results {
    if r.Status != http.StatusAccepted {
        log.Printf("event %d failed: %s", r.Index, r.Error.Message)
    }
}
```

Maximum 100 events / 1MB per batch. A `207 Multi-Status` response is not an error: `err` is nil and failures appear in `res.Results`.

## Errors

API errors are returned as `*loopwire.APIError`:

```go
var apiErr *loopwire.APIError
if errors.As(err, &apiErr) {
    switch apiErr.StatusCode {
    case http.StatusPaymentRequired: // 402 quota exceeded — not retryable
        alertBilling()
    case http.StatusConflict: // 409 idempotency key reused with different payload
        log.Printf("idempotency conflict: %s", apiErr.Message)
    default:
        log.Printf("loopwire %d %s (request %s)", apiErr.StatusCode, apiErr.Code, apiErr.RequestID)
    }
}
```

Helper predicates: `loopwire.IsRateLimited(err)`, `loopwire.IsQuotaExceeded(err)`, `loopwire.IsNotFound(err)`.

Retries: `429`, `500`, and transient network errors are retried with exponential backoff and jitter, honoring `Retry-After`, up to 5 attempts in total. `402` and other 4xx responses return immediately.

## Pagination

```go
iter := client.Subscribers.List(ctx, &loopwire.ListParams{Limit: 100})
for iter.Next() {
    sub := iter.Current()
    fmt.Println(sub.ID, sub.URL)
}
if err := iter.Err(); err != nil {
    return err
}
```

## Verifying deliveries

```go
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    body, err := io.ReadAll(io.LimitReader(r.Body, 256<<10+1))
    if err != nil {
        http.Error(w, "read error", http.StatusBadRequest)
        return
    }
    if !loopwire.VerifySignature(body, r.Header.Get("Loopwire-Signature"), signingSecret) {
        http.Error(w, "invalid signature", http.StatusBadRequest)
        return
    }
    w.WriteHeader(http.StatusOK) // respond within 10 seconds
    go process(body)
}
```

`VerifySignature` uses `hmac.Equal` (constant time) and accepts either of the two comma-separated signatures present during a signing-secret rotation. Read the body once — if middleware has already consumed `r.Body`, verification fails.

## Gotchas

- Don't create a new client per request; each client owns an HTTP transport and connection pool.
- If you pass your own `http.Client` with `WithHTTPClient`, keep its `Timeout` below any upstream deadline so retries have room to run.
- Set `LOOPWIRE_LOG=debug` to log attempts and request IDs through `log/slog`.
