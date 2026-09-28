# CI/CD Integration

This guide covers testing Loopwire integrations in continuous integration and managing Loopwire configuration as part of your deployment pipeline.

## Keys in CI

- Always use `lw_test_...` keys in CI. Test-mode events go to the project's test inbox, never reach real subscribers, and never count against your monthly event quota.
- Store the key as a masked CI secret (GitHub Actions secret, GitLab CI variable, CircleCI context) and expose it as `LOOPWIRE_API_KEY`. The SDKs and CLI read this variable automatically.
- Create a dedicated key for CI under **Project Settings > API Keys** so it can be revoked without affecting developers. Remember the limit of 5 active keys per project.
- Where possible, scope the CI key to the event types your tests publish (`POST /v1/keys` with a `scope` field).

Rate limits still apply in test mode. Parallel test jobs on the Free plan share 10 requests/second (burst 20); use batch publishing or reduce parallelism if you see `429` responses.

## GitHub Actions example

```yaml
name: webhook-integration
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      LOOPWIRE_API_KEY: ${{ secrets.LOOPWIRE_TEST_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm install -g @loopwire/cli
      - name: Start app
        run: npm start &
      - name: Forward test events to the app
        run: |
          loopwire listen --forward-to http://localhost:3000/webhooks --json > listen.log &
          sleep 3
      - run: npm test
```

`loopwire listen` authenticates with `LOOPWIRE_API_KEY` when no CLI session exists, which is the normal case on CI runners. Capture the session signing secret from its `--json` output (`{"type":"ready","signingSecret":"whsec_..."}`) and pass it to your app as `LOOPWIRE_SIGNING_SECRET`.

## Types of tests

**Unit tests (no network).** Build delivery requests yourself using the documented body format (`eventId`, `type`, `payload`, `timestamp`) and compute `Loopwire-Signature` with a fixed test secret. This is fast and deterministic and should cover most handler logic: signature rejection, idempotency, out-of-order handling.

**Contract tests.** Publish real test events through the API to verify request shapes: event type format (`^[a-z0-9_]+(\.[a-z0-9_]+)+$`, max 64 chars), payload size (256KB), and idempotency behavior (same key + different payload returns `409`).

**End-to-end tests.** Use `loopwire listen` to forward test events to the running app and assert on side effects. Keep these few; they depend on network access to `api.loopwire.dev`.

## Pinning the API version

Set `Loopwire-Version` explicitly in CI (`LOOPWIRE_API_VERSION=2026-01-15` or the SDK `apiVersion` option). This makes a version upgrade an explicit, reviewable change rather than something that happens when the project's pinned version changes. See API Versioning & Changelog.

## Managing configuration as code

Subscribers, keys, and projects can be managed declaratively with the Terraform provider (see Terraform Provider). A typical pipeline:

1. `terraform plan` on pull requests, posted as a comment.
2. `terraform apply` on merge to main, against the staging project.
3. Manual approval, then `apply` against the production project.

If you don't use Terraform, a deploy step can call `loopwire subscribers list --json` and create or update subscribers idempotently. Avoid creating a new subscriber on every deploy — each subscriber gets a new signing secret, and plan limits cap subscribers per project (Free 5, Growth 50, Scale 500).

## Deployments and key rotation

To rotate a live key during a deploy without downtime:

1. Create the new key.
2. Update the secret in your secrets manager and deploy.
3. Confirm traffic has moved to the new key (the dashboard shows last-used time per key).
4. Revoke the old key.

Do not revoke in the same pipeline step that creates the new key — services that haven't picked up the new secret will start receiving `401 Unauthorized`.

## Gotchas

- Forked pull requests usually cannot read repository secrets, so Loopwire contract/E2E tests will be skipped or fail there. Gate those jobs on the secret being present.
- CI runners behind an egress allowlist need access to `api.loopwire.dev` (and `api.eu.loopwire.dev` for EU projects).
- Don't point E2E tests at a live key "just once" — live events count against quota and reach real subscribers.
