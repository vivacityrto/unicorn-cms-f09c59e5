# Plan — activate-ghost-user full fix

Single-file change: `supabase/functions/activate-ghost-user/index.ts`. Two changes shipped in the same deployment.

## Change A — Role correction after auth user creation

Inserted directly after the `createErr` block (~line 131). Before generating any link/email:

1. Define `VIVACITY_TENANT_ID = 6372` and `isVivacity = body.tenant_id === VIVACITY_TENANT_ID`.
2. Look up the existing `tenant_users` row (`relationship_role`, `primary_contact`) for `(user_uuid, tenant_id)`.
3. Resolve `relationshipRole` = existing value, else `'primary_contact'` if `ghost.unicorn_role === 'Admin'`, else `'user'`.
4. Apply the same `CASE` mapping as `accept_invitation_v2` to derive: `tuRole`, `tuPrimary`, `tuSecondary`, `tuScope`, `uRole`, `uType`, `tmRole`, `tmStatus` (cases: `primary_contact`, `secondary_contact`, `academy_user`, default `user`).
5. Vivacity override: `uType='Vivacity Team'`, keep `ghost.unicorn_role`, `tmRole='Admin'`, `tmStatus='active'`.
6. Upsert `tenant_users` (onConflict `tenant_id,user_id`) with role/primary/secondary/access_scope/relationship_role.
7. Upsert `tenant_members` (onConflict `tenant_id,user_id`) with role/status/updated_at.
8. Update `public.users` with `unicorn_role`, `user_type`, `updated_at`.

`uRole` and `relationshipRole` produced here are reused by Change B.

## Change B — Replace recovery link with 7-day invite token

Remove (step 8 and step 9 in current file):
- `auth.admin.generateLink({ type: 'recovery' })` block.
- The entire inline Mailgun welcome email block (HTML/text/FormData/fetch).
- The current best-effort `user_invitations` insert at line 217-228 (replaced below).

Add to step 7 `createUser` metadata: `ghost_activation: true`.

Insert new flow:

1. Generate `inviteToken = crypto.randomUUID()`; SHA-256 hash → hex `tokenHash`.
2. `expiresAt = now + 7 days`.
3. Insert into `user_invitations` (status `pending`, invited_by caller, tenant_id, `unicorn_role: uRole`, `relationship_role: relationshipRole`, `token_hash`, `expires_at`, first_name, last_name) and `.select('id').single()` to capture `insertedInvite.id`.
4. Invoke `send-invitation-email` with `{ invitation_id: insertedInvite.id, token_plaintext: inviteToken }`; track `emailSent` / `emailError`.

## Audit + response updates

- Audit details now include: `relationship_role`, `tenant_users_role: tuRole`, `tenant_members_role: tmRole`, `roles_corrected: true`, plus existing `email`, `activated_by`, `email_sent`, `email_error`.
- Response: drop `action_link`; return `{ ok, email, invite_sent: emailSent, email_error, detail }` with detail reflecting the new "invite email sent (7-day token)" wording.

## Out of scope (unchanged)

Caller auth check, staff RPCs, payload validation, ghost lookup, `getUserById`/`listUsers` collision checks, UUID preservation in `createUser`, error response shapes/codes.
