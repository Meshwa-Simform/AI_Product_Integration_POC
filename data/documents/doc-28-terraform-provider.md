# Terraform Provider

The Loopwire Terraform provider (`loopwire/loopwire` on the Terraform Registry) manages projects, subscribers, and API keys as code. It works with Terraform 1.5+ and OpenTofu 1.6+.

## Configuration

```hcl
terraform {
  required_providers {
    loopwire = {
      source  = "loopwire/loopwire"
      version = "~> 1.4"
    }
  }
}

provider "loopwire" {
  # Reads LOOPWIRE_API_KEY if api_key is not set.
  api_key  = var.loopwire_api_key
  base_url = "https://api.loopwire.dev/v1" # EU: https://api.eu.loopwire.dev/v1 (Scale only)
}
```

The provider's key must belong to a user or service with at least the **Admin** role to manage API keys; **Developer** is sufficient for subscribers only. It automatically retries `429` and `500` responses (max 5 attempts, honoring `Retry-After`), so large plans may run slower on the Free plan's 10 requests/second limit rather than failing.

## Resources

### `loopwire_subscriber`

```hcl
resource "loopwire_subscriber" "orders" {
  project_id  = "prj_abc123"
  url         = "https://hooks.example.com/loopwire/orders"
  event_types = ["order.created", "order.updated"]
  paused      = false
}

output "orders_signing_secret" {
  value     = loopwire_subscriber.orders.signing_secret
  sensitive = true
}
```

| Argument | Required | Notes |
|---|---|---|
| `project_id` | yes | Changing it forces replacement. |
| `url` | yes | Must be HTTPS. Updating it is in-place. |
| `event_types` | no | Omit to receive all event types. Each entry must match `^[a-z0-9_]+(\.[a-z0-9_]+)+$`. |
| `paused` | no | Default `false`. Events published while `true` are not queued. |
| `rotate_secret_trigger` | no | Any string; changing it rotates the signing secret (old secret valid for 24 hours). |

Exported attributes: `id` (`sub_...`), `signing_secret` (`whsec_...`, sensitive), `status`, `created_at`.

### `loopwire_api_key`

```hcl
resource "loopwire_api_key" "ci" {
  project_id = "prj_abc123"
  name       = "ci-pipeline"
  mode       = "test"            # "test" -> lw_test_..., "live" -> lw_live_...
  scope      = { event_types = ["order.created"], read_only = false }
}
```

The generated key is available as the sensitive attribute `secret` **only when the resource is created**, because Loopwire never returns a full key again. Any change to `mode` or `scope` forces replacement (a new key). Destroying the resource revokes the key immediately — use `create_before_destroy` to rotate without downtime:

```hcl
lifecycle {
  create_before_destroy = true
}
```

Remember the limit of 5 active keys per project; `create_before_destroy` briefly needs one spare slot.

### `loopwire_project`

```hcl
resource "loopwire_project" "prod" {
  name   = "myapp-prod"
  region = "us" # or "eu" (Scale only)
}
```

`region` cannot be changed after creation; changing it in configuration forces replacement, which creates a brand-new, empty project. The provider refuses to destroy a project that has live events in the last 30 days unless `force_destroy = true`.

## Data sources

- `data "loopwire_project"` — look up a project by name.
- `data "loopwire_ips"` — current delivery IP ranges (from `https://api.loopwire.dev/v1/ips`), handy for building subscriber-side firewall rules.

```hcl
data "loopwire_ips" "delivery" {}

resource "aws_security_group_rule" "loopwire_ingress" {
  type        = "ingress"
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = data.loopwire_ips.delivery.cidrs
  security_group_id = aws_security_group.webhooks.id
}
```

## Importing existing resources

```
terraform import loopwire_subscriber.orders prj_abc123/sub_def456
terraform import loopwire_project.prod prj_abc123
```

API keys cannot be imported with their secret, because the full key is not retrievable after creation. Import them to manage the name and lifecycle only; `secret` will be empty.

## State security

Signing secrets and newly created API keys are stored in Terraform state. Use an encrypted remote backend with restricted access, and mark outputs `sensitive = true`. Anyone who can read state can publish events to your project.

## Gotchas

- Plan limits still apply: subscribers per project (Free 5, Growth 50, Scale 500) and projects per account (Free 2, Growth 10, Scale unlimited). `apply` fails with `403` when a limit is reached.
- Toggling `paused` via Terraform has the same effect as in the dashboard — events published while paused are recorded as `skipped` and never delivered.
- Changes made in the dashboard show up as drift on the next `plan`.
