# Fix invite acceptance: write tenant_members row and set profiles.active_tenant_id

## Findings from deep dive

- `public.accept_invitation_v2(text, uuid)` is `SECURITY DEFINER`, search_path `public, pg_temp`. It currently writes `users`, `tenant_users`, `user_invitations`, and `audit_eos_events` — but never `tenant_members` or `profiles`. Confirmed against the live function definition (202 lines).
- `tenant_members` is the canonical RLS source for `users_select_same_tenant` and many other policies (per `mem://security/users-rls-architecture`). Missing rows here are exactly why newly-invited users can't see tenant data.
- Schema reality:
  - `tenant_members(id uuid pk default gen_random_uuid(), tenant_id bigint NOT NULL, user_id uuid NOT NULL → users.user_uuid ON UPDATE CASCADE ON DELETE CASCADE, role text NOT NULL CHECK IN ('Admin','General User'), status text NOT NULL CHECK IN ('active','inactive','pending'), invited_at, joined_at default now(), created_at NOT NULL default now(), updated_at NOT NULL default now())`. Unique `(tenant_id, user_id)`. ON CONFLICT target in the spec matches.
  - `tenants` has both `id bigint` and `id_uuid uuid`. The spec correctly resolves `id_uuid` from the bigint `v_invitation.tenant_id`.
  - `profiles.user_id uuid`, `profiles.active_tenant_id uuid`, `profiles.updated_at timestamptz`. The spec's `WHERE user_id = p_user_id` matches.
- Role mapping in spec — `CASE WHEN v_tu_role = 'parent' THEN 'Admin' ELSE 'General User' END` — is consistent with the existing legacy/relationship_role derivation block (parent ⇒ Admin, child ⇒ General User). Vivacity-team invitations also fall through to `child` ⇒ `General User`, which is acceptable for `tenant_members.role` (Vivacity staff visibility is governed by `unicorn_role`/`is_team`, not by `tenant_members.role`).
- The `ON CONFLICT … DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()` is safe: if a member already exists we re-activate without demoting Admins, because re-acceptance only happens for the same invitation/role grant. (No existing flow downgrades Admin→General User via re-invitation.)
- The profiles UPDATE is gated on `active_tenant_id IS NULL`, so it never overwrites an existing active tenant for users who belong to multiple tenants. Safe.
- Frontend: `src/pages/AcceptInvitation.tsx` line 81 **already** contains `const VIVACITY_TENANT_ID = 6372;`. The requested edit is a no-op — I will skip it and call this out, rather than churning the file. Verified via ripgrep.
- All other invocations of `accept_invitation_v2` are unaffected — function signature, return shape, and existing writes are unchanged.

## Implementation

### 1. Migration — extend `accept_invitation_v2`

Replace the function with an identical body, inserting two new statements **after** the existing `INSERT INTO public.tenant_users … ON CONFLICT …` block (line 158 in the current definition) and **before** the `UPDATE public.user_invitations` block:

```sql
-- a) Mirror membership into tenant_members (canonical RLS source)
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
VALUES (
  v_invitation.tenant_id,
  p_user_id,
  CASE WHEN v_tu_role = 'parent' THEN 'Admin' ELSE 'General User' END,
  'active'
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  status = 'active',
  updated_at = now();

-- b) Set the user's active tenant if they don't have one yet
UPDATE public.profiles
SET active_tenant_id = (
       SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id
     ),
    updated_at = now()
WHERE user_id = p_user_id
  AND active_tenant_id IS NULL;
```

Everything else in the function — guards, role derivation, `users` re-link/insert/update, `tenant_users` write, `user_invitations` status flip, `audit_eos_events` insert, return JSON — is preserved verbatim. Function attributes (`SECURITY DEFINER`, search_path, language, signature) unchanged.

### 2. Frontend — no change required

`src/pages/AcceptInvitation.tsx:81` is already `const VIVACITY_TENANT_ID = 6372;`. No edit needed; the requested change matches the current state. I'll explicitly note this in the change log instead of re-writing the line.

## Risk assessment

- **RLS impact**: positive only. New `tenant_members` row enables `users_select_same_tenant` to function for invited users. No policy is altered.
- **FK constraints**: `tenant_members.user_id → users(user_uuid)` is satisfied because the function's earlier block guarantees a `users` row for `p_user_id` (via re-link/insert/update) before the new statements run.
- **CHECK constraints**: role values ('Admin','General User') and status ('active') both pass `tenant_members_role_check` and `tenant_members_status_check`.
- **Re-acceptance**: `ON CONFLICT` re-activates membership without orphaning historical rows. `profiles` update is idempotent and guarded by `IS NULL`.
- **Vivacity-team invitations** (tenant 6372): receive `tenant_members.role = 'General User'`. Their staff privileges flow through `unicorn_role` / `is_team` on `public.users`, not `tenant_members.role`, so this is correct.
- **Audit completeness**: existing `audit_eos_events` row already records `tenant_id`, `user_id`, and `tenant_users_role`. The two new writes are deterministic consequences of the same accept event and don't require separate audit entries. (Optional follow-up: add `tenant_members_role` and `active_tenant_set` flags into the existing `details` jsonb — flag for next sprint, not this one, since user said "do not touch any other logic".)
- **Backward compatibility**: signature and return shape unchanged; all callers continue to work.
- **Concurrency**: both new statements are single-row idempotent operations on uniquely-keyed rows; no deadlock risk vs the existing writes.

## Summary of changes

1. **DB migration**: `accept_invitation_v2` extended with `tenant_members` insert and conditional `profiles.active_tenant_id` set. No other function logic touched.
2. **Frontend**: no change — constant is already 6372.

### Benefits
- Invited users immediately gain RLS-visible tenant membership via `tenant_members`.
- Their portal lands on the correct active tenant on first login (no manual switcher step).
- Fix is self-contained inside one SECURITY DEFINER function — no policy, table, or hook changes.

### Residual risk
Low. The only behavioural delta for existing users is: on re-accepting an invitation, an `inactive` `tenant_members` row is reactivated. This is the intended outcome of accepting an invitation.
