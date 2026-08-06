# Audit: 2026-05-13 — NEW-006 `audit_user_events.tenant_id`

**Trigger:** NEW-006 (Medium) from the 12 May 2026 deployment status audit — `public.audit_user_events` had no `tenant_id` column, making it impossible to scope audit events to a tenant or grant tenant admins visibility into their own events.
**Author:** Carl
**Scope:** `public.audit_user_events` — column addition, index, and one new SELECT policy. No other tables, functions, or policies touched.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

`audit_user_events` was created in migration `20260512034144`. The deployment status audit flagged it as "created out-of-band" — this was based on a stale local codebase state (20 commits behind origin/main at the time). The migration is tracked. The table had no `tenant_id`, 0 rows, and no INSERT policy.

---

## Verdict

**Closed — `tenant_id` column, index, and tenant-admin SELECT policy applied and verified.**

---

## Findings

### Pre-apply state

| Check | Result |
|-------|--------|
| Row count | 0 — no backfill required |
| Columns | 7: `id, actor_user_uuid, target_user_uuid, action, reason, details, created_at` |
| Existing SELECT policies | 2: `audit_user_events_select_own`, `audit_user_events_select_superadmin` |
| `tenant_users.access_scope` + `relationship_role` | Present — RLS policy can reference them |
| `public.tenants.id` type | `bigint` — FK type matches |

### Design decision — nullable tenant_id

`tenant_id` added as nullable (not NOT NULL). Some events are platform-level with no tenant context — for example, a super admin changing a user's global role. Making the column NOT NULL would force all future callers to supply a tenant, which may not always be meaningful. Nullable allows callers to omit when the event has no tenant scope; the tenant-admin SELECT policy gates on `tenant_id IS NOT NULL` so null events are never exposed to non-superadmin users through that path.

---

## DB change shipped

### Migration `<timestamp>_audit_user_events_add_tenant_id.sql`

```sql
ALTER TABLE public.audit_user_events
  ADD COLUMN IF NOT EXISTS tenant_id bigint
    REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_user_events_tenant_idx
  ON public.audit_user_events (tenant_id, created_at DESC);

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
```

**Verification:**
- Columns: 8 including `tenant_id bigint / nullable` ✅
- Policies: 3 SELECT — `select_own`, `select_superadmin`, `select_tenant_admin` ✅
- FK: `tenant_id → tenants(id) ON DELETE SET NULL` ✅
- Index: `(tenant_id, created_at DESC)` btree ✅
- Existing policies untouched; no write policies added ✅

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

- `audit_user_events` referenced only in `src/integrations/supabase/types.ts` (auto-generated) and its own migration. No edge function or frontend component writes to it. No INSERT policy exists — writes are application-layer only when the write path is built.
- The deployment audit note "created out-of-band" was incorrect — migration `20260512034144` is tracked in `supabase_migrations.schema_migrations`.

---

## Decisions

- `tenant_id` nullable — platform-level events (no tenant context) are valid.
- `ON DELETE SET NULL` on the FK — if a tenant is deleted, the audit record is preserved with `tenant_id = NULL` rather than cascade-deleted (audit history should survive tenant deletion).
- No INSERT policy added — write path not yet built; RLS insert grant deferred until the first caller is implemented.

---

## Open questions parked

- **Write path:** Nothing currently writes to `audit_user_events`. The table is ready to receive events (column shape correct, tenant_id in place) but the first caller — likely `accept_invitation_v2` role-change events or admin user-management actions — needs to be wired in a separate session.
- **`actor_user_uuid` nullable:** The column allows NULL actors (system-initiated events). Whether any system events are planned should be confirmed when the write path is built.

---

## Tag

`audit-2026-05-13-new-006-audit-user-events-tenant-id`
