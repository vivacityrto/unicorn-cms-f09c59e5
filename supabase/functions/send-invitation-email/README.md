# send-invitation-email

Sends the Mailgun `unicorn_accept_invite_v1` template for a pending
`user_invitations` row.

## Authorization

In-code (do not rely on gateway `verify_jwt` alone):

| Caller | Gate |
|--------|------|
| Internal invite flow (`invite-user`, `resend-invite`, `activate-ghost-user`) | `Authorization: Bearer <SERVICE_ROLE_KEY>` |
| Staff | `auth.getUser` + `check_permission(..., 'admin.invites.manage', 'full')` |
| Tenant Admin | primary/secondary contact on the invitation's `tenant_id` |
| Invite creator (Vivacity staff) | `invited_by === caller.id` + `is_vivacity_team_safe` |

## Possession proof

Request body must include `{ invitation_id, token_plaintext }`. Before any
email is built, the function SHA-256-hashes `token_plaintext` and compares it
to the stored `token_hash`. Mismatch → **400**.

## Callers (do not change until after deploy smoke-test)

- `invite-user` → `functions.invoke('send-invitation-email', { body })` via service-role client
- `resend-invite` → same
- `activate-ghost-user` → same

These already present the service-role bearer; no caller updates are required
for the trusted-internal path to keep working.
