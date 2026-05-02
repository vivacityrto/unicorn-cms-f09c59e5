# Repair tenant invite pipeline end-to-end

Four changes, in order. Verified against live DB and confirmed against your two
corrections (accept_invitation_v2 and accept-tenant-invite both already exist —
we replace the RPC body and leave the dead edge function untouched).

---

## 1. Migration — rewrite `public.accept_invitation_v2` to write to `tenant_users`

`CREATE OR REPLACE FUNCTION` keeps the existing signature `(p_token_hash text, p_user_id uuid) RETURNS jsonb` so the frontend keeps working. Body changes:

- Inserts membership into `public.tenant_users` (not `tenant_members`) with the unique key `(tenant_id, user_id)` and the live role vocabulary `'parent' | 'child'` plus a `primary_contact` boolean.
- Mapping: `unicorn_role = 'Admin'` → `role='parent'`, `primary_contact=true`. Everything else → `role='child'`, `primary_contact=false`. `secondary_contact=false`, `access_scope='full'`.
- UPSERTs `public.users` first (so the row exists before the membership insert) with `tenant_id`, `unicorn_role`, `email`, `first_name`, `last_name`, `is_team = (tenant_id = 6372)`, `user_type = 'Vivacity' | 'Client'`, `disabled=false`. `ON CONFLICT (user_uuid) DO UPDATE` patches `tenant_id`/`unicorn_role`/`is_team`/`disabled` and only fills first/last name when currently empty.
- Locks the invitation row with `FOR UPDATE`, returns the same return codes the frontend already branches on:
  `INVALID_PARAMS | INVALID_TOKEN | EXPIRED | ALREADY_ACCEPTED | SUCCESS`.
- Marks invitation `status='accepted'`, sets `accepted_at`, `accepted_by_user_id`, `updated_at`.
- Best-effort audit insert into `audit_eos_events` wrapped in a sub-block so audit failures never block acceptance.
- `GRANT EXECUTE ... TO authenticated, service_role`.

We do not touch `tenant_members` (the dormant table). 391 historical rows there stay as-is — separate investigation, not launch-blocking.

## 2. Rewrite `supabase/functions/send-invitation-email/index.ts`

New input shape: `{ invitation_id: uuid, token_plaintext: string }`.

- `verify_jwt: true` (no config.toml change needed — default).
- Validates all four `MAILGUN_*` env vars; 500 with explicit detail if any missing.
- Loads invitation row + tenant name + inviter name (3 small selects via service-role client).
- AuthZ: caller must be Vivacity staff (tenant 6372 OR `unicorn_role IN ('Super Admin','Team Leader','Team Member')`) **or** have a `tenant_users` row with `role='parent'` on the invitation's tenant. 403 otherwise.
- Builds `invite_url = ${origin}/accept-invitation?token=${token_plaintext}` with origin resolution: `PUBLIC_APP_URL` env var → `Origin` header → `Referer` → fallback `https://app.unicorn-cms.au`.
- Formats `expiry_date` in `Australia/Sydney` as `D MMMM YYYY`.
- `role_label` map: `Super Admin`/`Team Leader`/`Team Member` pass through, `Admin` → `Organisation Admin`, `User` → `Team Member`.
- `inviter_name` = `first_name last_name` of `invited_by` user, or `'The Vivacity team'` fallback.
- POSTs to `https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages` with `template=unicorn_accept_invite_v1` and `t:variables` containing the seven variables you confirmed: `first_name, last_name, tenant_name, invite_url, expiry_date, role_label, inviter_name`. Subject: `You've been invited to join {tenantName} on Unicorn 2.0`. Tag: `invitation`.
- On non-2xx: log full Mailgun body, return 502, **do not** touch the invitation row (clean retry state).
- On 2xx: parse Mailgun `id`, then `UPDATE user_invitations SET mailgun_message_id, last_sent_at` and return 200.

CORS handled inline (preflight returns 200).

## 3. Two surgical edits to `supabase/functions/invite-user/index.ts`

Currently builds the URL itself and calls `send-invitation-email` with `{ email, inviteUrl, userType }`. Two changes:

a. After the `INSERT INTO user_invitations`, add `.select('id').single()` so we capture `newInviteRow.id`.

b. Replace the `supabase.functions.invoke('send-invitation-email', …)` body with `{ invitation_id: newInviteRow.id, token_plaintext: inviteToken }`. The 200 response from this function still includes `inviteUrl` (computed locally) for backwards-compat with any UI that reads it.

Everything else in this function — the `skip_email` path, rate limiting, `audit_invites`, `audit_eos_events`, role validation, tenant validation — stays untouched.

## 4. Three edits to `src/pages/AcceptInvitation.tsx`

a. Line 81 — change `const VIVACITY_TENANT_ID = 319;` to `6372`.

b. Tighten `finalizeInvitation` to branch on the returned `code`:

```text
SUCCESS           → toast success + navigate('/dashboard')
ALREADY_ACCEPTED  → toast info    + navigate('/login')
EXPIRED           → toast error,  no navigate, message "ask for a new invite"
INVALID_TOKEN     → toast error,  no navigate
```

The current code returns boolean and only logs failures — that swallows the EXPIRED / INVALID_TOKEN cases, which is part of the silent-failure problem.

c. Keep everything else: the existing UI (logo, form, password rules, signUp call, “User already registered → signInWithPassword” fallback) is fine. No new route, no new page.

---

## Files touched

```
sql-setup/13-rewrite-accept-invitation-v2.sql          (new — to be applied via migration tool)
supabase/functions/send-invitation-email/index.ts      (rewritten)
supabase/functions/invite-user/index.ts                (2 small edits)
src/pages/AcceptInvitation.tsx                         (~10 line edit)
```

Explicitly **not** touched (per your direction):

- `supabase/functions/accept-tenant-invite/` — left at v52, dead code, no rollback risk.
- `cancel-invite`, `resend-invite`, the legacy `accept_invite` RPC, `validate_invitation_token`, `admin_fix_invitations`.
- `user_invitations` schema (already has `mailgun_message_id` and `last_sent_at`).
- `tenant_members` table and its 391 historical rows.
- `App.tsx` routes — keeping `/accept-invitation` (which is what the email link uses).

## Migration delivery

Plan mode and Agent mode in this sandbox don't currently expose a database migration tool. The SQL for change 1 will be staged at `sql-setup/13-rewrite-accept-invitation-v2.sql` so you can paste it into the Supabase SQL Editor in one shot. As soon as the migration tool reappears in this conversation, I'll run it through that path automatically instead.

[Open SQL Editor](https://supabase.com/dashboard/project/yxkgdalkbrriasiyyrwk/sql/new)

## Acceptance test (run after merge + SQL applied)

1. Use the existing invite UI (or call `invite-user` directly) to invite `angela+invitetest@vivacity.com.au` to tenant `6372` with role `Team Member`.
2. Verify the new `user_invitations` row has `mailgun_message_id` and `last_sent_at` populated within seconds.
3. Inbox: email arrives via the `unicorn_accept_invite_v1` template, no literal `{{first_name}}` placeholders visible.
4. Click → lands at `https://app.unicorn-cms.au/accept-invitation?token=…`, welcome screen shows "Vivacity Coaching & Consulting" and the role.
5. Set password → submit → redirects to `/dashboard`.
6. SQL verification:

```sql
select status, accepted_at, accepted_by_user_id from user_invitations where id = '<id>';
select tenant_id, role, primary_contact from tenant_users where user_id = '<new auth user id>';
select tenant_id, unicorn_role from users where user_uuid = '<new auth user id>';
```

Expected:
- `user_invitations.status = 'accepted'`, `accepted_at` set, `accepted_by_user_id = new uuid`.
- `tenant_users` row exists with `tenant_id=6372`, `role='child'`, `primary_contact=false`.
- `users.tenant_id=6372`, `users.unicorn_role='Team Member'`.

7. Sign out, sign back in with the email + password → dashboard renders Vivacity tenant data.

If any step fails the PR isn't done.
