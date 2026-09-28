# CLI Reference

The Loopwire CLI (`loopwire`) lets you publish test events, inspect deliveries, manage subscribers, and forward test-inbox events to a server on your machine. It is distributed on npm as `@loopwire/cli`.

## Installation

```
npm install -g @loopwire/cli
loopwire --version
```

Node.js 18 or later is required. Homebrew users can also run `brew install loopwire/tap/loopwire`.

## Authentication

```
loopwire login
```

`login` opens the dashboard in a browser and stores a CLI session token in `~/.config/loopwire/config.json` (file mode `0600`). CLI sessions expire after 30 days of inactivity. For non-interactive environments such as CI, skip `login` and set `LOOPWIRE_API_KEY` instead; the environment variable always takes precedence over the stored session.

Select the project to operate on with `loopwire projects use prj_...`, or pass `--project prj_...` to any command.

| Command | Purpose |
|---|---|
| `loopwire login` / `logout` | Start or end a CLI session |
| `loopwire whoami` | Show the current user, project, region, and whether you're in test or live mode |
| `loopwire projects list` | List projects you can access |

## Forwarding events to localhost

```
loopwire listen --forward-to http://localhost:3000/webhooks
```

`listen` subscribes to your project's **test inbox** and replays each test event as an HTTP POST to the given local URL, with the same headers a real delivery carries (`Loopwire-Signature`, `Loopwire-Event-Id`, `Loopwire-Delivery-Attempt`, `Loopwire-Timestamp`).

Important details:

- `listen` only works with test-mode traffic (events published with an `lw_test_...` key). It never forwards live events.
- On start it prints a session signing secret (`whsec_...`) that is valid only while the command runs. Use it as your local signing secret — it is **not** the same as any subscriber's signing secret.
- The forward target may be plain HTTP because it's on your machine; real subscribers must use HTTPS.
- Filter event types with `--events order.created,order.updated`.
- The local server has 10 seconds to respond, the same as real deliveries. Timeouts and non-2xx responses are shown in the terminal but are **not** retried by `listen`.

## Publishing test events

```
loopwire events trigger order.created
loopwire events trigger order.created --payload '{"orderId":"ord_123","amount":4200}'
loopwire events trigger user.updated --payload @fixtures/user.json
```

`trigger` publishes with the project's test key, so the event lands in the test inbox and does not count against your monthly quota. Without `--payload`, a sample payload is generated from the event type's schema if one is registered, or `{}` otherwise. Prefix a path with `@` to read the payload from a file.

To publish live events from the CLI you must pass `--live` and a live key through `LOOPWIRE_API_KEY`. The CLI asks for confirmation unless `--yes` is also given.

## Inspecting events and deliveries

| Command | Description |
|---|---|
| `loopwire events list [--type t] [--limit n]` | Recent events, newest first (`--limit` max 100) |
| `loopwire events get evt_...` | Event details and payload (only within the retention window) |
| `loopwire deliveries list --event evt_...` | Every delivery attempt for an event, with status and response code |
| `loopwire deliveries list --status failed` | Failed deliveries across subscribers |
| `loopwire events redeliver evt_... --subscriber sub_...` | Manually redeliver; resets that delivery's retry counter |
| `loopwire logs tail` | Stream delivery results in real time |

`logs tail` supports `--status delivered|retrying|failed|skipped` and `--subscriber sub_...`.

## Managing subscribers

```
loopwire subscribers create --url https://example.com/hooks --events order.created
loopwire subscribers list
loopwire subscribers pause sub_...
loopwire subscribers resume sub_...
loopwire subscribers rotate-secret sub_...
```

`create` prints the signing secret once. `rotate-secret` issues a new `whsec_...` secret; the old one stays valid for 24 hours.

Remember that pausing does not buffer events: anything published while a subscriber is paused is recorded as `skipped` for it and is not delivered on resume.

## Output and scripting

- `--json` prints machine-readable output for every command.
- Exit codes: `0` success, `1` generic error, `2` usage error, `3` authentication error, `4` API returned 4xx, `5` API returned 5xx after retries.
- Like the SDKs, the CLI retries `429` and `500` responses up to 5 attempts, honoring `Retry-After`.

```
loopwire events list --type order.created --limit 100 --json | jq -r '.data[].id'
```

## Gotchas

- `loopwire whoami` is the fastest way to confirm you're not accidentally in live mode.
- If `listen` shows signature failures in your app, you are probably verifying with the subscriber's secret instead of the session secret printed by `listen`.
- The CLI session token has the permissions of your user role; a Viewer cannot trigger events or create subscribers.
