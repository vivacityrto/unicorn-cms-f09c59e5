# Audit: 2026-05-14 — P1-c closure, client_audit_log FK, tenant_users user_left trigger

**Trigger:** Follow-on session to close remaining open items from the 14 May 2026 audit log initiative and the P1-b RLS hardening session.
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. Three findings; two DB changes shipped.

---

## Background

Three open items were investigated this session:

1. **P1-c** (`consult_*` RLS hardening) — blocked since 13 May 2026 pending Ask Viv edge function changes.
2. **`client_audit_log` FK** — `tenant_id` had no FK to `tenants(id)`; noted in the addin_audit_log session.
3. **`tenant_users` DELETE trigger** — only INSERT (`user_joined`) was wired in Phase 3; DELETE (`user_left`) was deferred.

---

## Findings

### P1-c — already resolved

Live `pg_policies` query confirmed 0 bare `auth.uid()` calls remaining across all `consult_*` tables. All policies use the `(SELECT auth.uid())` subquery form. This was resolved in a subsequent Lovable session after P1-b — no action required. Verified:

```sql
SELECT COUNT(*) FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'consult%'
AND (
  (qual ~ 'auth\.uid\(\)' AND qual !~ '\(\s*SELECT\s+auth\.uid')
  OR (with_check ~ 'auth\.uid\(\)' AND with_check !~ '\(\s*SELECT\s+auth\.uid')
);
-- Result: 0 ✅
```

### `client_audit_log` FK — 106 orphaned rows

Pre-migration check found 106 rows referencing `tenant_id` values not present in `tenants`. All from 9 deleted tenants, all dated January–March 2026 (dev/test era). Historical audit data — not deleted. Table confirmed active: 1,126 rows, latest write 2026-05-14, 48 distinct action types.

### `audit_user_events` columns confirmed

`target_user_uuid` is NOT NULL — write path for `user_left` must always supply a valid `user_id` from OLD.

---

## DB changes shipped

### Migration 1 — `client_audit_log` FK

```sql
ALTER TABLE public.client_audit_log
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD CONSTRAINT client_audit_log_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
```

`NOT VALID` preserves the 106 orphaned historical rows. All future INSERTs enforced. `ON DELETE SET NULL` means audit rows survive tenant deletion with `tenant_id = NULL`.

### Migration 2 — `tenant_users` DELETE trigger

Function `fn_audit_tenant_users_delete`, trigger `trg_audit_tenant_users_delete` (AFTER DELETE, FOR EACH ROW). SECURITY DEFINER, `SET search_path = ''`. Writes `user_left` to `public.audit_user_events` with `target_user_uuid = OLD.user_id`, `tenant_id = OLD.tenant_id`, `actor_user_uuid = (SELECT auth.uid())`, `details` packing `role`, `relationship_role`, `access_scope` from OLD.

---

## Verification

| Check | Result |
|---|---|
| P1-c: 0 bare auth.uid() in consult_* | ✅ |
| client_audit_log_tenant_id_fkey present, NOT VALID | ✅ |
| tenant_id nullable | ✅ |
| trg_audit_tenant_users_delete enabled | ✅ |
| fn_audit_tenant_users_delete SECURITY DEFINER, search_path='' | ✅ |
| Smoke test: DELETE → count=1 in audit_user_events | ✅ |

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: No codebase changes. Both migrations are DB-layer only.

---

## Decisions

- **NOT VALID chosen over full validation**: 106 orphaned rows from deleted tenants are historical audit data. Destroying them to satisfy the constraint would lose audit history. NOT VALID enforces on all future writes while leaving existing rows intact.
- **ON DELETE SET NULL**: Tenant deletion nulls the FK rather than cascading a delete — audit history is preserved even if the tenant is removed.
- **P1-c closed without action**: Live DB is already clean. The blocker (Ask Viv edge function changes) was evidently resolved in an unrecorded Lovable session. No further work required.

---

## Open questions parked

- **`client_audit_log` orphaned rows**: 106 rows with NULL-equivalent tenant references from deleted tenants remain. Could be cleaned up (DELETE WHERE tenant_id IN (...)) if audit history for deleted tenants is not needed. Deferred — Angela to decide retention policy.
- **Scenario C (UI dashboard)**: Expose audit feed to staff via controlled edge function. Separate session.

---

## Tag

`audit-2026-05-14-p1c-consult-rls-closed-and-followons`
