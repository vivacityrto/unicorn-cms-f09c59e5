# NEW-006 — `audit_user_events.tenant_id`

## Preconditions verified (read-only)

| Check | Result |
|---|---|
| `public.tenants.id` type | `bigint` ✓ (FK type matches) |
| `audit_user_events` columns (current) | `id, actor_user_uuid, target_user_uuid, action, reason, details, created_at` (7 cols) — adding `tenant_id` → **8 cols** ✓ |
| Existing policies on `audit_user_events` | `audit_user_events_select_own`, `audit_user_events_select_superadmin` (2 SELECT) — leaves room for the new third ✓ |
| `tenant_users` has `access_scope` + `relationship_role` | ✓ both present |
| `audit_user_events` row count | **0** — no backfill required ✓ |

No conflicts. SQL is safe to apply verbatim.

## Migration file

**Path**: `supabase/migrations/<timestamp>_audit_user_events_add_tenant_id.sql`

```sql
BEGIN;

-- Add tenant_id (nullable: some events are platform-level with no tenant
-- context, e.g. global role changes by a super admin)
ALTER TABLE public.audit_user_events
  ADD COLUMN IF NOT EXISTS tenant_id bigint
    REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS audit_user_events_tenant_idx
  ON public.audit_user_events (tenant_id, created_at DESC);

-- Tenant admins can see audit events for their own tenant
DROP POLICY IF EXISTS "audit_user_events_select_tenant_admin"
  ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_tenant_admin"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid())
        AND tu.tenant_id = audit_user_events.tenant_id
        AND tu.access_scope = 'full'
        AND tu.relationship_role IN ('primary_contact', 'secondary_contact')
    )
  );

COMMIT;
```

## What changes

- **Column**: adds nullable `tenant_id bigint` FK → `tenants(id)` `ON DELETE SET NULL`.
- **Index**: composite `(tenant_id, created_at DESC)` for tenant-scoped recency queries.
- **Policy**: adds third SELECT policy `audit_user_events_select_tenant_admin` granting authenticated users SELECT on rows whose `tenant_id` matches a `tenant_users` membership where `access_scope = 'full'` and `relationship_role` is `primary_contact` or `secondary_contact`.

## What does NOT change

- Existing `audit_user_events_select_own` and `audit_user_events_select_superadmin` policies untouched.
- No INSERT/UPDATE/DELETE policies added (writes remain application-layer).
- No data backfill (table empty).
- No edits to frontend, edge functions, or generated types.

## Post-apply verification

```sql
-- 1. Column shape (expect 8 rows incl. tenant_id bigint YES)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='audit_user_events'
ORDER BY ordinal_position;

-- 2. Policies (expect 3: own, superadmin, tenant_admin)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='audit_user_events'
ORDER BY policyname;

-- 3. FK + index sanity
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.audit_user_events'::regclass AND contype='f';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='audit_user_events'
  AND indexname='audit_user_events_tenant_idx';
```

Awaiting `apply`.
