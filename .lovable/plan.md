## Fix: KPI v2 uses wrong source for CSC tenant ownership

### Problem
On `/kpi` (kpi-v2), the Communication, Retention, and CSC Tasks cards derive "tenants owned by this CSC" from `tenants.assigned_consultant_user_id`. The authoritative source is `tenant_csc_assignments` with `is_primary = true` and `ended_at IS NULL`. The single-tenant reassignment RPC doesn't sync the legacy column, so numbers drift for any CSC who has been reassigned via that path.

### Scope
Only the kpi-v2 surface. Do not touch `/my/kpi` (deprecated v1) or anything else.

Files to change:
1. `src/lib/kpi-v2/fetchers.ts` — `fetchRetention`, `fetchCommunication`, `fetchCscTasks`
2. `src/components/kpi-v2/CscKpiCards.tsx` — inline `fetchComms` (and any other duplicated tenant lookup)
3. `src/components/kpi-v2/KpiDrillDownSheet.tsx` — retention, communication, and csc_tasks branches

### The change (applied consistently in all three files)

Replace every query shaped like:
```ts
supabase.from("tenants")
  .select("id, ...")
  .eq("assigned_consultant_user_id", subjectUuid)
  .eq("status", "active")
```
with a two-step lookup off `tenant_csc_assignments`:

```ts
// Step 1: primary tenant_ids for this CSC
const { data: aRows } = await supabase
  .from("tenant_csc_assignments")
  .select("tenant_id")
  .eq("csc_user_id", subjectUuid)
  .eq("is_primary", true)
  .is("ended_at", null);
const tenantIds = Array.from(new Set((aRows ?? []).map(r => r.tenant_id).filter(Boolean)));
```

Then, where the previous code needed `churned_at` / `created_at` (retention only), do a follow-up:

```ts
// Step 2 (retention only): fetch lifecycle fields for those tenants
const { data: tRows } = await supabase
  .from("tenants")
  .select("id, created_at, churned_at")
  .in("id", tenantIds);
```

### Per-function detail

**`fetchRetention`** — replace the `tenants` query with the assignments lookup, then fetch `id, created_at, churned_at` for those `tenantIds`. Keep the existing `atStart` / `churned` math and `RetentionResult` shape unchanged.

**`fetchCommunication`** — replace the initial `tenants` query with the assignments lookup. Downstream logic (client-message fetch by `tenant_id`, conversation-initiator filter, SLA calc) unchanged.

**`fetchCscTasks`** — currently joins through `client_package_stages.client_packages.assigned_csc_user_id`. Change to: derive `tenantIds` via `tenant_csc_assignments`, then query `client_team_tasks` filtered through `client_package_stages.client_packages.tenant_id IN tenantIds`. Preserves the same "package tasks for this CSC's clients" semantics via the authoritative ownership source.

**`CscKpiCards.tsx`** — the inline `fetchComms` block does the same `tenants` query; replace with the same assignments lookup. No UI changes.

**`KpiDrillDownSheet.tsx`** — three branches (retention, communication, csc_tasks) each redo the tenant lookup. Replace each with the assignments query. Retention branch also gets the follow-up `tenants` fetch for `created_at` / `churned_at`. Keep the isolated tenant-name lookup (for display) in its own try/catch as it already is.

### Notes
- `is_primary = true` + `ended_at IS NULL` matches the pattern already used in `useCscAssignments.ts` and `useTenantCSCAssignment.tsx` — restores consistency.
- No DB migration and no changes to `admin_set_tenant_csc_assignment` in this plan.
- No UI changes.

### Verification after deploy
On `/kpi` with Team KPI on, period = This Month:
- **Angela Connell-Richards** — Communication should no longer show "67% / 2 of 3 messages replied within 12 hrs" (tenant 7512, Australian College Pty Ltd, is no longer hers).
- **Gemma Frith** — Communication should now show real data instead of "No Data" — she's tenant 7512's current primary CSC.
- **Tenant 6370 (Aspen Medical Pty Ltd)** — confirm numbers attribute to whoever `tenant_csc_assignments.is_primary=true` says.
- **Angela's Retention/Tasks** — should include tenant 1053 (NSW Fishing Industry Training Committee Ltd), which `assigned_consultant_user_id` had as NULL despite a valid current assignment.
- Confirm **Nova Canto** and the **Reviewer test account** Team KPI view still loads for all CSCs (both go through the internal-staff RLS branch, not admin override).

### Deferred (separate follow-up)
`superseded_at`, RPC write-path fix in `admin_set_tenant_csc_assignment`, edge-function consolidation, and the weekly/monthly/quarterly picker — needs a migration and its own audit workflow.
