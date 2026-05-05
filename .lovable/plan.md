## Two changes

### Part 1 — Roll child-tenant consult **time** up to billing parent

**Clarification:** Parent and child each keep their **own** packages, stages, tasks, documents, audits — everything. The **only** thing that rolls up is consult **time**: minutes logged against the child are deducted from the **parent's** package pool, not the child's.

Example: Think Real Estate (7541, parent) and Real Estate Training Solutions (7544, child). 7544 has its own packages and stages, but every minute logged against 7544 burns down 7541's hours. 7544 itself shows zero pool.

**Schema**

```sql
ALTER TABLE public.tenant_relationships
  ADD COLUMN bills_to_parent boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.resolve_billing_tenant_id(_tenant_id bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT tr.parent_tenant_id
       FROM tenant_relationships tr
      WHERE tr.child_tenant_id = _tenant_id AND tr.bills_to_parent = true
      LIMIT 1),
    _tenant_id);
$$;

ALTER TABLE time_entries
  ADD COLUMN billing_tenant_id bigint
  GENERATED ALWAYS AS (resolve_billing_tenant_id(tenant_id)) STORED;
CREATE INDEX time_entries_billing_tenant_idx ON time_entries(billing_tenant_id);
```

`tenant_id` is preserved on every entry (audit: who actually consumed the time, against which of *their* packages/stages). Only the burndown joins switch to `billing_tenant_id`.

**Important nuance — package_instance_id stays on the child's package.** When a 7544 user logs time, `package_instance_id` references a 7544 package (their own stages still tick over). What changes is which tenant's *included-hours pool* the minutes count against. So `rpc_get_membership_usage` (tenant-pool view) sums by `billing_tenant_id`, but `rpc_get_package_usage_data` (per-package burndown) keeps summing by `package_instance_id` as it does today — the child's own packages still show their own usage. The parent's membership pool simply absorbs the totals from both tenants.

**RPC updates**

- `rpc_get_membership_usage(p_tenant_id)` — sum where `billing_tenant_id = resolve_billing_tenant_id(p_tenant_id)`. (For a child whose time bills to parent, this returns zero.)
- `rpc_get_package_usage_data` — unchanged; per-package usage is per-package regardless of who owns it.

**UI**

- `src/components/tenant/TenantRelationships.tsx` — new "Child's consult time bills to this parent" checkbox (SuperAdmin / Vivacity staff only) + a small badge on the relationship row when on.
- `src/components/capacity/MembershipUsageCard.tsx` — when viewing a child whose time bills to parent: replace the pool with a banner *"Consult time for this organisation is billed to {parent name}. View pool →"*. The child's own packages continue to display normally elsewhere.
- `src/components/client/ClientTimeWidget.tsx` / `TenantTimeTrackerBar.tsx` — same banner near the timer; the timer itself works exactly as today (logs to the child's package).
- No changes needed to `useTenantTimeTracker` or `usePackageUsageQuery` — they continue to operate on the child's own packages.

**Audit:** every toggle of `bills_to_parent` writes to `audit_events` with `{from, to}`.

**Backfill:** flag the existing 7541→7544 relationship row.

---

### Part 2 — Rename a tenant (RTO-aware)

**Rule (per your latest):** the name is editable only when the tenant has **no real RTO ID**. Specifically: editable when `tenants.rto_id` is `NULL`, blank, or **non-numeric** (e.g. `TBA`, `Pending`). As soon as a numeric RTO code is present, the legal name is owned by TGA — the field becomes read-only, and the only way to change it is to re-query TGA. This keeps KickStarts (which sit on placeholder text until registration lands) renameable, while stopping anyone from overwriting a TGA-sourced name.

**Eligibility helper** (used by UI and SQL):

```ts
const RTO_NUMERIC = /^\d+$/;
const canRenameTenant = (rtoId?: string | null) =>
  !rtoId || !RTO_NUMERIC.test(rtoId.trim());
```

```sql
CREATE FUNCTION public.tenant_name_is_locked(_tenant_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(btrim(rto_id) ~ '^[0-9]+$', false)
    FROM tenants WHERE id = _tenant_id;
$$;
```

**UI in `src/pages/ClientDetail.tsx` header**

- Pencil icon next to the tenant name **only** when `canRenameTenant(tenant.rto_id)` and user is SuperAdmin / Vivacity staff.
- When locked: small lock icon + tooltip *"Name is managed by TGA (RTO {rto_id}). Re-query TGA to change."*
- Click opens new `src/components/tenant/RenameTenantDialog.tsx` (FormModal): single trimmed Input, required, ≤120 chars, soft duplicate-name warning.
- Save: `update tenants set name = $1 where id = $2 and tenant_name_is_locked(id) = false` — the WHERE clause defends against a TGA link being added between page load and submit.

**Audit:** `audit_events` row with `{from, to, rto_id_at_change}`.

**Permissions:** SuperAdmin / Vivacity staff only.

---

## Files touched

- DB migration: `tenant_relationships.bills_to_parent`, `resolve_billing_tenant_id()`, `time_entries.billing_tenant_id` generated column + index, `rpc_get_membership_usage` update, `tenant_name_is_locked()`.
- `src/components/tenant/TenantRelationships.tsx`
- `src/components/capacity/MembershipUsageCard.tsx`
- `src/components/client/ClientTimeWidget.tsx`, `TenantTimeTrackerBar.tsx`
- `src/pages/ClientDetail.tsx`
- new `src/components/tenant/RenameTenantDialog.tsx`
- one-off insert flagging the 7541→7544 relationship

## Out of scope

- Multi-level chains (only direct parent resolved).
- Splitting time across multiple parents.
- Bulk renames; tenant-admin renames.

## Open question

Confirm rename stays SuperAdmin / Vivacity staff only (default), or also allow client Admins while their RTO ID is still placeholder?
