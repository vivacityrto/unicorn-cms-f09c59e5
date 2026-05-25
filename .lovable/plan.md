# Fix: Role change fails for ghost users in `set_relationship_role`

## Root cause (confirmed against live DB)

- `audit_eos_events.user_id` has FK `audit_eos_events_user_id_fkey → auth.users(id)` (no `ON DELETE` action, no deferrable).
- The final `INSERT INTO public.audit_eos_events (...)` in `public.set_relationship_role` passes `p_user_id` as `user_id`.
- Ghost users (imported from Unicorn 1.0, never invited) exist in `public.users` but have no `auth.users` row. The INSERT raises SQLSTATE `23503` (`foreign_key_violation`), which aborts the entire function transaction. The earlier `UPDATE`s on `tenant_users`, `users`, and `tenant_members` roll back. Frontend shows "Failed to update role."

Other writes in the function are safe for ghosts:
- `tenant_users.user_id` FK → `public.users(user_uuid)` ✓ ghost row exists.
- `public.users` update by `user_uuid` ✓ ghost row exists.
- `tenant_members.user_id` is not constrained to `auth.users` (verified via the FK scan; only `meeting_id` and `user_id→auth.users` FKs exist on `audit_eos_events`, and `tenant_members` has its own non-auth FK).

The independent `fn_audit_tenant_users` trigger writes to `audit_user_events` and is unaffected — it is fired by the `tenant_users` UPDATE that already succeeds.

## Change (single migration, function body only)

Recreate `public.set_relationship_role` with the same signature, `SECURITY DEFINER`, `SET search_path = 'public','pg_temp'`, identical auth checks, identical CASE block, identical UPDATEs and the tenant_members upsert. The only difference is the final audit INSERT:

```sql
BEGIN
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, p_user_id, 'tenant_users', NULL,
    'relationship_role_changed', p_reason,
    jsonb_build_object( /* unchanged payload, including changed_by = v_caller */ )
  );
EXCEPTION
  WHEN foreign_key_violation THEN
    -- Ghost user: no auth.users row for p_user_id.
    -- The role-change writes above (tenant_users, users, tenant_members) are preserved.
    -- The tenant_users UPDATE already triggered fn_audit_tenant_users → audit_user_events,
    -- so the change is still auditable.
    NULL;
END;
```

Notes on the handler:
- The `BEGIN ... EXCEPTION ... END` block creates a PL/pgSQL subtransaction; only the audit INSERT is rolled back on FK violation. All previous statements in the outer block remain committed when the function returns.
- We catch only `foreign_key_violation` (23503) — not the generic `OTHERS` — so genuine bugs (NOT NULL, type mismatch, RLS, etc.) still surface.
- Return value, signature, search_path, and authorization logic are unchanged.

## What is explicitly NOT changing

- `audit_eos_events` table, columns, FK definitions.
- Any RLS policy.
- `audit_user_events` table or `fn_audit_tenant_users` trigger.
- Frontend (`TenantUsersTab.tsx`, `applyRelationshipRole`, `confirmPrimarySwap`) — no changes; the RPC now returns `{ ok: true, ... }` for both ghost and normal users.
- `src/integrations/supabase/types.ts` — signature unchanged, regeneration not required.

## Test scenarios

1. **Ghost user (Unicorn 1.0 import, no auth.users row)** — change `user → academy_user`:
   - `tenant_users.relationship_role`, `role`, `access_scope` updated.
   - `users.unicorn_role`, `user_type` updated.
   - `tenant_members` row upserted.
   - `audit_eos_events` insert silently skipped (FK violation caught).
   - `audit_user_events` row written by `fn_audit_tenant_users` (audit trail preserved for the membership change).
   - RPC returns `{ ok: true }`. Frontend toast shows success.

2. **Normal user (has auth.users row)** — change `user → primary_contact`:
   - All four writes succeed, including `audit_eos_events`. Behaviour identical to today.

3. **Caller not authorized** — still `42501`, no writes.
4. **Invalid `p_relationship_role`** — still raises, no writes.
5. **Missing `tenant_users` row** — still raises, no writes.
6. **Failure in `tenant_users`/`users`/`tenant_members` write** — outside the exception block, still aborts the whole function (transaction rollback). No partial state.

## Backward compatibility & risk

- Signature, return shape, security definer, search_path, RLS, and FKs all unchanged → zero callsite impact.
- For non-ghost users the execution path is byte-identical to today.
- For ghost users the only observable difference is: role change now succeeds (the bug fix) and one `audit_eos_events` row is intentionally skipped. This is acceptable because:
  - The FK on `audit_eos_events.user_id → auth.users(id)` makes recording ghost users impossible by design without a schema change (out of scope per instructions).
  - The parallel `fn_audit_tenant_users` trigger still captures the membership change in `audit_user_events`, preserving an audit trail.
- No new objects, no data migration, no downtime.

## Deliverable

One Supabase migration that runs `CREATE OR REPLACE FUNCTION public.set_relationship_role(...)` with the body above. No other files touched.
