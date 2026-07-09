# Add "Accounts" category to Client Timeline

Adds who invited/activated/deactivated/role-changed/removed which account, and fixes a pre-existing RLS role-list drift bug on `client_timeline_events` while we're here.

## 0. Migration A — RLS role-list fix (independent correctness fix)

New migration. Drop and recreate both policies on `public.client_timeline_events` so the full current internal-staff role list is honoured (currently only 3 of 7 roles are matched, so Integrator/BGT/CSC/CET staff silently can't read internal timeline rows):

- `Vivacity team can view all timeline events` (SELECT)
- `Vivacity team can insert timeline events` (INSERT)

Role list inlined verbatim: `Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET`. SELECT policy keeps the existing tenant-match / Super Admin+Team Leader global-view branch. Add a one-line SQL comment above each policy pointing to `src/lib/roles/vivacityRoles.ts` as the source of truth.

## 1. Migration B — CHECK constraint + new RPC

Same or separate migration file (single call is fine — pure DDL/function creation, no data):

**CHECK constraint.** Drop `timeline_valid_event_type` on `client_timeline_events` and recreate it with the existing 30 values plus the 5 new ones: `account_invited, account_activated, account_deactivated, account_role_changed, account_removed`.

**RPC `public.rpc_set_client_account_status(p_user_uuid uuid, p_disabled boolean)`.** SECURITY DEFINER, pinned `search_path = public`, mirrors the `rpc_create_client_note` pattern:

1. `v_actor_id := auth.uid();` → return `{success:false, error:'Not authenticated'}` if null.
2. Load target's `tenant_id, first_name, last_name, email, disabled` from `users`.
3. Permission check: allow if `check_permission(v_actor_id, 'admin.team_users.manage', 'full')` returns true, OR caller's own row has `unicorn_role = 'Admin'` AND `user_type = 'Client'` AND `tenant_id` matches target. Else `{success:false, error:'Forbidden'}`.
4. If `p_disabled = current disabled` → return `{success:true, unchanged:true}` (no duplicate event).
5. `UPDATE users SET disabled = p_disabled, updated_at = now() WHERE user_uuid = p_user_uuid`.
6. `INSERT INTO client_timeline_events` with:
   - `tenant_id` = target's tenant_id
   - `client_id` = target's tenant_id::text (matches app convention — `ClientDetail.tsx` passes `clientId={tenant.id.toString()}`)
   - `created_by` = `v_actor_id`
   - `source = 'user'`, `visibility = 'internal'`
   - `event_type` = `'account_deactivated'` or `'account_activated'`
   - `title` = `'Account deactivated: '` / `'Account activated: '` + full name
   - `entity_type = 'user'`, `entity_id = p_user_uuid::text`
   - `metadata = jsonb_build_object('target_email', email, 'target_name', full_name)`
7. Return `{success:true}`.

Grants: `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT EXECUTE TO authenticated`.

## 2. Shared type lists

- `src/types/timeline.ts` — append the 5 new event types under a new `// Accounts` section in `TIMELINE_EVENT_TYPES`.
- `supabase/functions/_shared/emit-timeline-event.ts` — add the same 5 values to its `VALID_EVENT_TYPES` set (it holds its own copy).

## 3. Route all `users.disabled` toggles through the RPC

Three current writers, all switched to `rpc_set_client_account_status`. Existing `audit_eos_events` inserts stay (additive, not a replacement).

- `supabase/functions/toggle-user-status/index.ts` — replace the `.update({ disabled, updated_at })` call with `supabase.rpc('rpc_set_client_account_status', { p_user_uuid: user_uuid, p_disabled: disabled })`. Preserve the existing permission-error/audit-log paths; if the RPC returns `success:false`, surface as 403/400 accordingly.
- `supabase/functions/bulk-user-action/index.ts` — in the `activate`/`deactivate` branch, drop the bulk `.update(...).in(...)` and loop calling the RPC per uuid, collecting a success count. `change_role` branch stays as an UPDATE (handled in step 4).
- `src/components/client/TenantUsersTab.tsx` `handleSaveEdit` (~L720) — replace direct `.update({ disabled: editForm.disabled })` with the RPC, and only fire when `editForm.disabled !== editingMember.users.disabled`.

## 4. Role changes, invites, removals (edge-function emitters)

Use existing `emitTimelineEvent` helper. All events: `source: 'user'`, `visibility: 'internal'`, `client_id = target.tenant_id.toString()`, `entity_type: 'user'`.

- **`account_role_changed`** — `bulk-user-action/index.ts`, `change_role` branch, after successful update, one emit per affected user. Title: `Role changed: {name} → {role}`. Metadata includes `previous_role`, `new_role`, `target_email`.
- **`account_invited`** — `bulk-account-actions/index.ts`, after each `activate-ghost-user` invoke returning outcome `"sent"`. Title: `Account invitation sent: {email}`.
- **`account_removed`** — `delete-user/index.ts`, capture `first_name/last_name/email/tenant_id` before the delete executes, then emit before the auth+users deletes run. Title: `Account removed: {name}`.

## 5. Frontend wiring

- `src/components/client/ClientTimelineTab.tsx` — add `{ value: 'accounts', label: 'Accounts', icon: UserCog }` to `FILTER_OPTIONS`, placed after `notes` and before `microsoft`. Import `UserCog` from `lucide-react`.
- `src/hooks/useClientManagementData.tsx` — add to `EVENT_TYPE_FILTERS`:
  ```ts
  accounts: ['account_invited','account_activated','account_deactivated','account_role_changed','account_removed'],
  ```
- `src/components/client/TimelineEventCard.tsx`:
  - `EVENT_ICON_MAP`: `account_invited: UserPlus`, `account_activated: UserCheck`, `account_deactivated: UserX`, `account_role_changed: UserCog`, `account_removed: UserMinus`.
  - `EVENT_COLOR_MAP`: green (activated, invited), red (deactivated, removed), indigo (role_changed) — matching existing token conventions.
  - `getModuleChip`: `if (eventType.startsWith('account')) return 'Accounts';`.
  - `getPrimaryAction`: case for all five `account_*` → `{ label: 'View account', path: `/clients/${event.tenant_id}?tab=users` }`.

## Verification

After migrations approved and code lands:
1. Superadmin path: toggle a user in `TenantUsersTab` → timeline row appears in Accounts filter.
2. Client-admin path: same-tenant Admin toggling one of their own users → RPC allows, event written.
3. Bulk deactivate 3 users via SuperAdmin → 3 timeline rows, one per user.
4. Delete a user → `account_removed` appears (event written before deletion).
5. Confirm Integrator/BGT/CSC/CET staff can now read internal timeline events (regression from step 0).
6. Confirm existing `audit_eos_events` writes still fire in all three touched edge functions.

## Notes / risks

- `rpc_set_client_account_status` short-circuits when value unchanged — no duplicate events on idempotent toggles.
- Migration is DDL-only (constraint swap + policy recreate + function create), single transaction is fine.
- No frontend changes to `emitTimelineEvent` payload shape needed — new event types are additive.
- Role-list drift will recur unless a shared SQL helper is introduced later; out of scope here, called out in policy comments.
