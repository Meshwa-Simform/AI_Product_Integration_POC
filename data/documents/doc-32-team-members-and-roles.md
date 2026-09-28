# Team Members & Roles

Loopwire accounts can have multiple team members. Each member signs in with their own login and is assigned a role that controls what they can see and change.

## Seat limits by plan

| Plan | Team members per account |
|---|---|
| Free | 3 |
| Growth | 10 |
| Scale | Unlimited |

The limit counts active members plus pending invitations. Once you hit the limit, the **Invite Member** button is disabled until you remove a member, revoke a pending invite, or upgrade.

## Roles

There are four roles. Each member has exactly one role.

| Capability | Owner | Admin | Developer | Viewer |
|---|---|---|---|---|
| View events, subscribers, usage | ✅ | ✅ | ✅ | ✅ |
| Publish test events from the dashboard | ✅ | ✅ | ✅ | ❌ |
| Create / edit / pause subscribers | ✅ | ✅ | ✅ | ❌ |
| Manually redeliver failed events | ✅ | ✅ | ✅ | ❌ |
| Create, scope, and revoke API keys | ✅ | ✅ | ❌ | ❌ |
| Invite and remove members, change roles | ✅ | ✅ | ❌ | ❌ |
| Create and delete projects | ✅ | ✅ | ❌ | ❌ |
| Manage billing, plan, and payment method | ✅ | ❌ | ❌ | ❌ |
| Transfer account ownership | ✅ | ❌ | ❌ | ❌ |

Key points:

- **Viewer** is fully read-only. Viewers can inspect the event log and delivery attempts but cannot change anything.
- **Developer** is the typical role for engineers: they can manage subscribers and publish test events, but cannot create API keys.
- **Admin** manages keys and members but cannot touch billing.
- **Owner** is the only role that can manage billing. Every account has exactly one Owner.

## Inviting members

Admins and the Owner can invite members from **Account Settings > Team > Invite Member** by entering an email address and choosing a role. The invitee receives an email with a link that expires after 7 days. An expired invitation must be re-sent; it still occupies a seat until it is revoked or it expires.

Invitations can also be sent via the API:

```
POST /v1/members/invitations
{
  "email": "dev@example.com",
  "role": "developer"
}
```

Valid role values are `admin`, `developer`, and `viewer`. Inviting someone directly as Owner is not possible — use ownership transfer instead.

## Changing roles

Admins can change any member's role except the Owner's. Admins cannot promote someone to Owner. Role changes take effect on the member's next request — an already-open dashboard session picks up the new permissions within one minute.

## Removing members

Removing a member immediately ends their dashboard sessions. Important: **removing a member does not revoke API keys they created.** API keys belong to the project, not the person. If a departing team member had access to a key's value, revoke and rotate that key (see Authentication & API Keys for zero-downtime rotation).

## Transferring ownership

Only the current Owner can transfer ownership, from **Account Settings > Team**. The new Owner must already be an active member (not a pending invite). After the transfer, the previous Owner becomes an Admin. Billing responsibility moves to the new Owner, but the card on file stays in place until the new Owner updates it.

## Project-level access

By default, members can access every project in the account. On Growth and Scale plans, Admins can restrict a member to specific projects under **Team > Member > Project Access**. A member with no project access can still sign in but sees an empty project list.

## SSO-managed members

On the Scale plan, members can be provisioned and deprovisioned automatically via SCIM, and roles can be mapped from identity-provider groups. See SSO & SCIM for details. SCIM-managed members cannot be edited manually in the dashboard.

## Gotchas

- The seat limit on Free (3) includes the Owner.
- Viewers cannot see API key values or signing secrets — only the last 4 characters.
- Downgrading to a plan with fewer seats requires removing members first; the downgrade request is blocked until the member count fits.
