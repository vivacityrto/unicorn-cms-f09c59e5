## Goal

Let Vivacity staff activate a "ghost user" (row in `public.users` with no matching `auth.users`) on demand: create the auth row using the ghost's existing UUID (preserving every FK), email them a branded "set your password" link, and record an audit event.

---

## 1. Database — new RPC `public.is_ghost_user`

Migration (single statement, additive, no schema changes elsewhere):

```sql
CREATE OR REPLACE FUNCTION public.is_ghost_user(p_user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE user_uuid = p_user_uuid)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_uuid);
$$;

REVOKE ALL ON FUNCTION public.is_ghost_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ghost_user(uuid) TO authenticated;
```

Notes:
- `SECURITY DEFINER` so authenticated callers can probe `auth.users` membership without direct grant.
- Returns `false` for unknown UUIDs (avoids leaking that "no such user" vs "ghost").
- Read-only, no side effects, no audit row.

---

## 2. New edge function `supabase/functions/activate-ghost-user/index.ts`

`verify_jwt = false` (lovable default) — caller JWT is validated in code using the same pattern as `invite-user` / `send-password-reset`. Service-role client used for the rest.

Request body:
```ts
{ user_uuid: string; tenant_id: number }
```

Flow:

1. **CORS preflight** → 200 with shared `corsHeaders`.
2. **Auth caller**:
   - Read `Authorization: Bearer <jwt>`, call `supabase.auth.getUser(token)`. Missing/invalid → 401.
   - Check staff via the canonical RPCs already in the DB:
     ```ts
     const { data: isStaff } = await supabase.rpc('is_vivacity_team_safe');
     const { data: isSA }    = await supabase.rpc('is_super_admin_safe');
     ```
     Both invoked with the caller's JWT-bound client (separate `createClient` with `global.headers.Authorization`). If neither → 403 `FORBIDDEN`.
3. **Validate payload** (zod-style guard): `user_uuid` must be UUID, `tenant_id` must be number → 400 `INVALID_PAYLOAD`.
4. **Lookup ghost** in `public.users` by `user_uuid` → `email, first_name, last_name`. Missing → 404 `USER_NOT_FOUND`.
5. **Confirm ghost** with `supabase.auth.admin.getUserById(user_uuid)`:
   - If returns a user → 409 `ALREADY_ACTIVATED`.
   - On unexpected error (other than "not found") → 500 `AUTH_LOOKUP_FAILED`.
6. **Defensive email collision**: `supabase.auth.admin.listUsers()` paginated check for `email == ghost_email` (case-insensitive). If a different UUID already owns that email → 409 `EMAIL_TAKEN_BY_OTHER_AUTH_USER` (prevents trying to mint a duplicate-email auth row, which would 500 from gotrue).
7. **Create auth row using existing UUID** (this is the key step — preserves all 108 `ON UPDATE CASCADE` FKs as-is, no relink trigger fires):
   ```ts
   await supabase.auth.admin.createUser({
     id: user_uuid,
     email: ghost_email,
     email_confirm: true,
   });
   ```
   On error → 500 `AUTH_CREATE_FAILED`.
8. **Generate recovery link**:
   ```ts
   const origin = req.headers.get('origin') || 'https://unicorn-cms.au';
   await supabase.auth.admin.generateLink({
     type: 'recovery',
     email: ghost_email,
     options: { redirectTo: `${origin}/reset-password` },
   });
   ```
   On error → 500 `LINK_GENERATION_FAILED`. (Auth row already exists; staff can retry — re-call is safe because step 5 will now 409, and we provide a separate "Resend welcome" affordance via the existing `send-password-reset` function.)
9. **Send branded welcome email** directly via Mailgun (same path as `send-password-reset`, no second function hop — keeps it self-contained and lets us use a distinct subject/copy):
   - Subject: `Your Unicorn account is ready`.
   - Body: greeting with `first_name || email.split('@')[0]`, one-line "Vivacity has activated your Unicorn account", a `Set up my password` button to `action_link`, plain-text fallback link, "expires in 1 hour" notice.
   - Reuses `MAILGUN_*` env vars (already set, EU region).
   - On Mailgun failure: **log and continue**, do not roll back the auth row. Return success but include `email_sent: false` and `email_error` in the response so the UI can surface a softer toast.
10. **Audit** (best-effort; wrap in try/catch so a failed audit insert never blocks the activation success):
    ```ts
    await supabase.from('audit_eos_events').insert({
      tenant_id,
      user_id: user_uuid,               // now valid — auth row exists
      entity: 'users',
      entity_id: user_uuid,
      action: 'ghost_user_activated',
      details: { email: ghost_email, activated_by: caller.id, email_sent }
    });
    ```
    The FK `audit_eos_events.user_id → auth.users(id)` is now satisfied because we just created that row.
11. **Return 200**:
    ```json
    { "ok": true, "email": "...", "email_sent": true, "detail": "Account activated and welcome email sent" }
    ```

Concurrency note: two simultaneous calls are de-duped by gotrue's unique constraint on `auth.users(id)` — second call returns a 422/409 from `createUser`, we map to 409 `ALREADY_ACTIVATED`.

Config: register in `supabase/config.toml` with `verify_jwt = false` (matches sibling functions). No new secrets.

---

## 3. Frontend — `src/components/client/TenantUsersTab.tsx`

Surgical, additive UI only:

a. **Detect ghosts** after the existing `members` query resolves. One batched call:
   ```ts
   const { data } = await supabase.rpc('is_ghost_user', { p_user_uuid: ... });
   ```
   Wrap in `Promise.all` over `members.map(m => m.user_id)`; store `Set<string>` of ghost UUIDs in component state (`ghostUserIds`). Re-run when `members` changes.

b. **Staff-only gate**: compute `const canActivateGhosts = isSuperAdmin() || isVivacityTeam` (pull `isVivacityTeam` from `useRBAC()` — already imported pattern elsewhere). Never render the button when `!canActivateGhosts`, so the client portal is unaffected.

c. **Row UI** (inside the existing `members.map` action cluster around line 566): when `canActivateGhosts && ghostUserIds.has(member.user_id)`, render an "Activate account" `<Button size="sm" variant="outline">` next to the role badge with a `Sparkles`/`KeyRound` icon. Disable + spinner while in flight (`activatingUserId === member.user_id`).

d. **Handler**:
   ```ts
   const { data, error } = await supabase.functions.invoke('activate-ghost-user', {
     body: { user_uuid: member.user_id, tenant_id: tenantId },
   });
   ```
   On success: `toast.success(\`Account activated — welcome email sent to ${data.email}\`)` (or a softer message if `email_sent === false`), then `setGhostUserIds(prev => { const n = new Set(prev); n.delete(member.user_id); return n; })` to hide the button immediately. On error: `toast.error(error?.message ?? data?.detail ?? 'Activation failed')`.

e. **Edit drawer**: leave entirely untouched in this pass. Role-change Select for a ghost continues to work (already fixed in prior `set_relationship_role` patch).

No other files touched. `src/integrations/supabase/types.ts` will be regenerated automatically after the migration; we do not hand-edit it.

---

## 4. What is explicitly NOT changing

- No RLS policy changes anywhere.
- No table schema, column, FK, or trigger changes (including `audit_eos_events.user_id → auth.users(id)` — by activating first, then auditing, the FK is satisfied naturally).
- No `user_invitations` row written; this is a direct activation, not the invite flow.
- No new UUIDs minted — ghost's existing `user_uuid` is reused as `auth.users.id`, so `tenant_users`, `tenant_members`, and every other downstream FK keep working without the `link_auth_user_to_profile` trigger or any sweep.
- `set_relationship_role`, `send-invitation-email`, `send-password-reset`, and the role-change flow are untouched.

---

## 5. Risk assessment

| Area | Risk | Mitigation |
|---|---|---|
| Duplicate email in auth | gotrue would reject | Step 6 pre-check + step 7 error mapping → 409, no partial state |
| Auth created but email fails | Ghost is "activated" without knowing | Return `email_sent: false`; staff can resend via existing `send-password-reset` (now works because auth row exists) |
| Audit insert fails | Activation already complete | Wrapped in try/catch; logged, never rolls back |
| Concurrent activations | Race on `createUser` | DB unique constraint resolves; second caller gets 409 |
| Non-staff caller | Privilege escalation | Server-side `is_vivacity_team_safe`/`is_super_admin_safe` check + UI gate |
| Client portal exposure | Button shown to clients | Gated on `canActivateGhosts`, button never rendered for non-staff |
| `is_ghost_user` info disclosure | Reveals auth membership | Restricted to `authenticated`, returns false for unknown UUIDs |
| Existing FK references break | None — UUID preserved end-to-end |

Backward compatible, audit-complete, additive only. Safe to ship.

---

## 6. Deliverables

1. One migration: `CREATE FUNCTION public.is_ghost_user(uuid)`.
2. New edge function folder `supabase/functions/activate-ghost-user/` with `index.ts` (and a config.toml entry mirroring `send-password-reset`).
3. Edit `src/components/client/TenantUsersTab.tsx`: add ghost detection state, staff-gated "Activate account" button, invoke handler.

No other files modified.
