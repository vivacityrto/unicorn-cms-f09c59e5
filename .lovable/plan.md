# Users page Phase 2 — invite + resend + revoke

## Discovery (Step 1 result)

Three existing edge functions handle this flow today on the staff side. Reuse all three.

| Function | Purpose | Today's auth | Payload |
|---|---|---|---|
| `invite-user` | Create pending invite + dispatch Mailgun email | Vivacity staff **or** tenant Admin (verified via `tenant_users` membership lookup against `payload.tenant_id`) | `{ email, first_name, last_name, invite_as: 'CLIENT', tenant_id, unicorn_role: 'Admin'\|'User' }` |
| `resend-invite` | Rotate token, bump `last_sent_at`, re-send email | SuperAdmin **or** tenant Admin — but currently checks `callerProfile.tenant_id === invitation.tenant_id` (single-tenant assumption) | `{ invitation_id }` |
| `cancel-invite` | Soft-revoke (sets `status='revoked'`, `revoked_at`, clears `token_hash`) | **SuperAdmin only** today — tenant Admins are blocked | `{ invitation_id, reason? }` |

Two of these need surgical auth/payload extensions before the client UI can use them; nothing else changes.

### Required edge-function changes

1. **`cancel-invite` — widen auth to tenant Admins.**
   Replace the SuperAdmin-only gate with the same pattern `invite-user` uses: SuperAdmin **or** a row in `tenant_users` where `user_id = caller` AND `tenant_id = invitation.tenant_id` AND the caller's `unicorn_role IN ('Admin')` (or `tenant_users.relationship_role IN ('primary_contact','secondary_contact')`). Tenant scope comes from the invitation row itself, so there's no spoof surface.

2. **`resend-invite` — fix multi-tenant auth check.**
   Today: `callerProfile.tenant_id === invitation.tenant_id` (uses the legacy single-tenant column on `users`). Replace with a `tenant_users` membership lookup against `invitation.tenant_id`, matching `invite-user`'s pattern. SuperAdmin path stays.

3. **`invite-user` — accept optional `relationship_role`.**
   Today the function only takes `unicorn_role` (`Admin`/`User`). The Phase 2 modal needs three distinct outcomes (`secondary_contact`, `user`, `academy_user`), which all map to `unicorn_role='User'` or `'Admin'` and are indistinguishable downstream without `relationship_role`. Add an optional `relationship_role: 'secondary_contact'|'user'|'academy_user'` to the payload, validate it's not `primary_contact`, and persist it on the inserted `user_invitations` row. `accept_invitation_v2` already prefers `relationship_role` when present, so no SQL change is needed.

   Validation: if `relationship_role='secondary_contact'`, reject when a non-revoked, non-expired pending invite OR an active `tenant_users` row already holds `secondary_contact` for that tenant — same shape as the existing `INVITE_EXISTS` 409.

No new edge functions. No SQL invitation logic touched. `accept_invitation_v2`, `validate_invitation_token`, `check_invitation_expiry_trigger`, `user_invitations`, `users`, `tenant_users` all untouched.

## Database change (additive)

`CREATE OR REPLACE VIEW public.v_client_tenant_users` (Option A from the prompt). Strictly additive:

- Add `last_sent_at timestamptz` and `mailgun_message_id text` to both CTEs (`active_users` returns `NULL`/`NULL`; `pending_invites` returns `ui.last_sent_at`/`ui.mailgun_message_id`).
- Keep `security_invoker = true` and the existing filters (excludes archived users, `is_vivacity_internal`, accepted/revoked/expired invites).

## Frontend

### `src/hooks/use-client-tenant-users.ts`

Extend `ClientTenantUserRow` with the two new nullable fields. No query change.

### `src/components/client/ClientUsersPage.tsx`

- Replace the disabled `Invite user` button with an active one. Disabled state with "Admin only" tooltip when `useAuth().getTenantRole(activeTenantId) !== 'Admin'`.
- Empty state: drop "— coming soon" and add the same `Invite user` CTA inline.
- Pending rows: add a kebab `DropdownMenu` (Resend, Revoke). Hidden on active rows. Disabled when not Admin.
- Pending rows: small `Mail`/`MailWarning` lucide icon next to the status pill driven by `last_sent_at`, with `date-fns` relative tooltip.

### New components (kept colocated under `src/components/client/users/`)

- `InviteUserDialog.tsx` — shadcn `Dialog`, `react-hook-form` + `zod` schema. Fields: email (required, lowercased on submit), first name (required, trimmed), last name (optional). Access level radio with three options:

  | Radio label | `unicorn_role` | `relationship_role` |
  |---|---|---|
  | Full access | `User` | `user` |
  | Academy only | `User` | `academy_user` |
  | Secondary contact | `Admin` | `secondary_contact` |

  No "Primary contact" option. Pre-submit checks query the cached `v_client_tenant_users` rows for this tenant: reject if email already a confirmed member, reject if email already has an active pending invite (offer "Resend the existing invite instead"), reject secondary_contact slot if already taken.

  Submit calls `supabase.functions.invoke('invite-user', { body: { email, first_name, last_name, invite_as: 'CLIENT', tenant_id: activeTenantId, unicorn_role, relationship_role } })`. Map the documented error codes (`INVITE_EXISTS`, `INVALID_EMAIL`, `ROLE_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED`, `FORBIDDEN`) to inline messages; fall through to a generic toast.

- `RevokeInviteAlert.tsx` — shadcn `AlertDialog`. On confirm: `supabase.functions.invoke('cancel-invite', { body: { invitation_id: rowKey, reason: 'Revoked by tenant admin' } })`.

- `useInviteMutations.ts` — three TanStack `useMutation` hooks (`invite`, `resend`, `revoke`) sharing one `onSuccess` that invalidates `['client_tenant_users', activeTenantId]` and toasts. `resend` calls `supabase.functions.invoke('resend-invite', { body: { invitation_id } })`.

All three actions explicitly include `tenant_id: activeTenantId` (belt-and-braces); the edge functions remain the canonical gate.

## What's not in scope

Edit confirmed users, remove confirmed users, transfer primary contact, reactivate disabled users, per-user audit log, bulk CSV invite. All Phase 3+.

## Files

**Migrations**
- `supabase/migrations/<ts>_v_client_tenant_users_add_invite_metadata.sql` — `CREATE OR REPLACE VIEW` adding the two columns.

**Edge functions (edit + redeploy)**
- `supabase/functions/cancel-invite/index.ts` — widen auth to tenant Admins.
- `supabase/functions/resend-invite/index.ts` — switch to `tenant_users` membership check.
- `supabase/functions/invite-user/index.ts` — accept + persist optional `relationship_role`; secondary_contact uniqueness check.

**Frontend**
- `src/hooks/use-client-tenant-users.ts` — extend type.
- `src/components/client/ClientUsersPage.tsx` — wire button, kebab, mail icon, empty-state CTA.
- `src/components/client/users/InviteUserDialog.tsx` (new)
- `src/components/client/users/RevokeInviteAlert.tsx` (new)
- `src/components/client/users/useInviteMutations.ts` (new)

## Smoke checks

The set listed in the prompt (invite, duplicate-block, resend, revoke confirm, confirmed-member rejection, secondary_contact second-slot allowed, non-admin disabled state, cross-tenant RLS, mobile, clean build).
