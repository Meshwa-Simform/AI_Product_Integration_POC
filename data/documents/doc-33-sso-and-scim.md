# SSO & SCIM

Loopwire supports single sign-on (SSO) via **SAML 2.0** and automated user provisioning via **SCIM 2.0**. Both features are available on the **Scale plan only**. Free and Growth accounts sign in with email and password (optionally with two-factor authentication).

## Supported identity providers

Any SAML 2.0–compliant identity provider (IdP) works. Loopwire provides tested setup guides for Okta, Microsoft Entra ID (Azure AD), Google Workspace, and OneLogin.

## Setting up SAML SSO

Only the account Owner or an Admin can configure SSO, from **Account Settings > Security > Single Sign-On**.

1. In your IdP, create a new SAML application using the values shown on the Loopwire SSO page:
   - **ACS URL**: `https://dashboard.loopwire.dev/sso/saml/acs`
   - **Entity ID / Audience**: `https://dashboard.loopwire.dev/sso/saml/metadata`
   - **Name ID format**: email address
2. Copy the IdP metadata URL (or upload the metadata XML) into Loopwire.
3. Click **Test Connection**. Loopwire performs a test sign-in with your own account.
4. Once the test succeeds, choose an enforcement mode.

### Enforcement modes

- **Optional** — members can sign in with SSO or with email/password.
- **Required** — members must sign in with SSO. Email/password logins are disabled for everyone except the account Owner, who keeps a password login as a break-glass fallback in case the IdP is unavailable.

Switching to **Required** ends all existing non-SSO dashboard sessions immediately.

## Required SAML attributes

| Attribute | Required | Purpose |
|---|---|---|
| `email` | Yes | Matches the Loopwire member |
| `firstName` | No | Display name |
| `lastName` | No | Display name |
| `loopwireRole` | No | Role mapping (`admin`, `developer`, `viewer`) |

If `loopwireRole` is omitted, new SSO users are created with the **Default role for new SSO users** setting, which defaults to `viewer`.

## Just-in-time provisioning

With JIT provisioning enabled, anyone who authenticates through your IdP and belongs to the Loopwire application is created as a member on first sign-in. JIT-created members still count toward seats, but seats are unlimited on the Scale plan.

## SCIM provisioning

SCIM lets your IdP create, update, and deactivate Loopwire members automatically.

- **SCIM base URL**: `https://api.loopwire.dev/scim/v2`
- **Authentication**: a SCIM bearer token generated under **Security > SCIM > Generate Token**. The token is shown once; generating a new token invalidates the old one immediately.

Supported operations:

- `POST /Users` — create a member
- `PATCH /Users/{id}` — update name, role, or `active` status
- `DELETE /Users/{id}` — remove a member
- `GET /Groups`, `PATCH /Groups/{id}` — group-to-role mapping

Setting `active: false` from the IdP removes the member's access and ends their sessions within 60 seconds.

### Group-to-role mapping

Map IdP groups to Loopwire roles under **Security > SCIM > Group Mapping**, for example `eng-platform → developer` and `sre-leads → admin`. If a user belongs to multiple mapped groups, they get the highest-privilege role among them. The Owner role can never be assigned via SCIM or SAML.

## Interaction with API keys

SSO and SCIM control **dashboard** access only. API keys are not tied to people and continue working when a member is deprovisioned. When offboarding someone who had access to key values, rotate those keys.

## Troubleshooting

- **"User not assigned to application"** — the user isn't assigned to the Loopwire app in the IdP.
- **"Signature validation failed"** — the IdP signing certificate changed; re-upload the metadata.
- **Clock skew** — SAML assertions are rejected if the IdP clock is more than 3 minutes off.
- **Locked out** — the Owner can always sign in with email/password and disable SSO enforcement.

## Downgrading from Scale

If you downgrade from Scale, SSO and SCIM stop working at the start of the next billing cycle. Members are converted to email/password logins and receive a password-setup email.
