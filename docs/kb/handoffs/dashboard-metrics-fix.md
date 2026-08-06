# Dashboard Metrics Fix Plan

> **Created:** 10 June 2026 | **Project:** Unicorn 2.0
> **Status:** Ready to implement — Phase 0 first

---

## Problem summary

The staff dashboard triage view has three compounding issues:

1. **Wrong source tables** — `v_dashboard_tenant_portfolio` reads from `consult_logs` (0 rows) and `tasks_tenants` (0 rows). Real data lives in `time_entries` (1,049 rows) and `client_action_items` (23 rows).
2. **Wrong row scope** — The view filters `lifecycle_status IN ('active', 'suspended')` returning 387 rows. Only 61 are `status = 'active'` — the ones the dashboard actually shows. 326 suspended rows are fetched and silently discarded. This is the root cause of the CSC "All Clients" timeout.
3. **Missing cron jobs** — `run-stage-health-monitor` and `run-workload-forecast` edge functions exist and write to the right tables, but have never been scheduled. Result: `stage_health_snapshots` (0 rows), `tenant_package_burn_forecast` (0 rows), `evidence_gap_checks` (0 rows).

---

## What this fixes

| Issue | Fix | Fixes "All Clients" for CSC? |
|---|---|---|
| `consult_hours_30d` always 0 | Read from `time_entries` | — |
| `open_tasks_count` always 0 | Read from `client_action_items` | — |
| `days_since_activity` always 259 | Include `time_entries` in activity calc | — |
| All attention scores = 15 | Above fixes make sub-scores meaningful | Indirectly |
| GAPS ONLY filter returns nothing | Cron job runs `run-stage-health-monitor` | — |
| BURN CRITICAL filter returns nothing | Cron job runs `run-workload-forecast` | — |
| Stage Health filter returns nothing | Same cron jobs | — |
| CSC "All Clients" timeout (500 errors) | Row scope fix: 387 → 61 rows | **Yes** |

---

## Phase tracking

| Phase | Name | Type | Status | Depends on |
|---|---|---|---|---|
| 0 | Fix `v_dashboard_tenant_portfolio` view | Lovable DB migration | ✅ Done | Nothing |
| 1 | Add cron jobs for health + forecast | Direct SQL | ✅ Done | Phase 0 deployed |
| 2 | Frontend: lightweight "All Clients" query | Lovable frontend | ✅ Done | Nothing (parallel with Phase 0) |
| 3 | Fix stage status value inconsistency | Direct SQL | ✅ Done | Phase 1 run once manually |
| 4 | CSC data sync + labour efficiency fixes | Direct SQL + Lovable | ✅ Done (all 4 sub-items) | Phases 0–3 done |

---

## Phase 0 — Fix `v_dashboard_tenant_portfolio` (Lovable DB migration, production DB protocol)

### What to change

Three changes in a single migration to the `v_dashboard_tenant_portfolio` view:

**Change A — Fix row scope (6× performance improvement, fixes CSC All Clients timeout)**

```sql
-- Before:
WHERE ((t.lifecycle_status = ANY (ARRAY['active'::text, 'suspended'::text]))
  AND (COALESCE(t.is_system_tenant, false) = false))

-- After:
WHERE t.status = 'active'
  AND COALESCE(t.is_system_tenant, false) = false
```

This drops from 387 rows to 61. Both `v_dashboard_attention_ranked` and `v_dashboard_behavioural_prompts` inherit this fix automatically (they read from this view).

**Change B — Fix consult hours (read from `time_entries` instead of empty `consult_logs`)**

```sql
-- Before (reads 0 rows):
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(c.hours), 0) AS hours_30d
  FROM consult_logs c
  WHERE c.client_id = t.id_uuid
    AND c.date >= (now() - '30 days'::interval)::date
) cl ON (true)

-- After (reads 1,049 rows):
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(te.duration_minutes) / 60.0, 0) AS hours_30d
  FROM time_entries te
  WHERE te.tenant_id = t.id
    AND te.start_at >= now() - interval '30 days'
) cl ON (true)
```

This makes `consult_hours_30d` reflect actual logged time and also fixes the "No consult logged in 30 days" behavioural prompt noise (it will now only fire for genuinely inactive clients).

**Change C — Fix task counts (read from `client_action_items` instead of empty `tasks_tenants`)**

```sql
-- Before (reads 0 rows):
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE NOT tt.completed) AS open_count,
         count(*) FILTER (WHERE NOT tt.completed AND tt.due_date < now()) AS overdue_count,
         max(tt.updated_at) AS latest_task_at
  FROM tasks_tenants tt
  WHERE tt.tenant_id = t.id
) tk ON (true)

-- After (reads 23 rows — column names confirmed):
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE cai.completed_at IS NULL) AS open_count,
         count(*) FILTER (WHERE cai.completed_at IS NULL
           AND cai.due_date IS NOT NULL AND cai.due_date < CURRENT_DATE) AS overdue_count,
         max(cai.updated_at) AS latest_task_at
  FROM client_action_items cai
  WHERE cai.tenant_id = t.id
) tk ON (true)
```

> ✅ **Column names confirmed:** `due_date` (type date), completion tracked via `completed_at` (NULL = open, non-NULL = done).

**Also fix `v_tenant_last_activity`** — this view calculates `last_activity_at` but reads from `consult_logs` (empty). Add `time_entries` to the GREATEST() calculation:

```sql
-- Add this to the GREATEST() in v_tenant_last_activity:
COALESCE((SELECT MAX(te.start_at) FROM time_entries te WHERE te.tenant_id = t.id)::timestamptz,
         '1970-01-01 00:00:00+00'::timestamptz)
```

This will fix `days_since_activity` showing 259 for all clients (staleness_score will become meaningful).

### Pre-flight assertions

```sql
-- Confirm row count will drop
SELECT COUNT(*) FROM public.tenants WHERE status = 'active' AND COALESCE(is_system_tenant,false) = false;
-- Expect: ~61

-- Confirm time_entries has recent data
SELECT COUNT(*), MAX(start_at) FROM public.time_entries
WHERE start_at >= now() - interval '30 days';
-- Expect: >0 rows

-- Confirm client_action_items exists and has data
SELECT COUNT(*), array_agg(DISTINCT status) FROM public.client_action_items;
```

### Post-flight verification

```sql
-- After recreating the view, check that data flows through
SELECT tenant_name, consult_hours_30d, open_tasks_count, days_since_activity
FROM public.v_dashboard_attention_ranked
ORDER BY consult_hours_30d DESC
LIMIT 10;
-- consult_hours_30d should no longer be all 0
-- days_since_activity should be varied, not all 259
```

---

## Phase 1 — Add cron jobs for health and forecast (direct SQL)

Both edge functions are already built and write to the right tables. They just need to be scheduled.

**Run manually first** before scheduling to validate output:

```sql
-- Manually trigger via net.http_post (check output before scheduling)
SELECT net.http_post(
  url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/run-stage-health-monitor',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb
);
```

After confirming output, schedule both jobs:

```sql
-- run-stage-health-monitor: daily at 1am AEST (15:00 UTC)
-- Writes to: stage_health_snapshots + evidence_gap_checks
SELECT cron.schedule(
  'run-stage-health-monitor-nightly',
  '0 15 * * *',
  $$ SELECT net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/run-stage-health-monitor',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);

-- run-workload-forecast: daily at 2am AEST (16:00 UTC)
-- Writes to: stage_health_snapshots + tenant_package_burn_forecast
SELECT cron.schedule(
  'run-workload-forecast-nightly',
  '0 16 * * *',
  $$ SELECT net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/run-workload-forecast',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

**Verification after first scheduled run:**

```sql
SELECT COUNT(*) FROM public.stage_health_snapshots;       -- should be > 0
SELECT COUNT(*) FROM public.evidence_gap_checks;          -- should be > 0
SELECT COUNT(*) FROM public.tenant_package_burn_forecast; -- should be > 0

-- Check dashboard metrics have differentiated
SELECT tenant_name, attention_score, stage_score, gaps_score, burn_score
FROM public.v_dashboard_attention_ranked
ORDER BY attention_score DESC
LIMIT 5;
-- Scores should now vary across clients
```

---

## Phase 2 — Frontend: lightweight "All Clients" query for non-SA (Lovable frontend)

Parallel with Phase 0. Regardless of the view fix, the frontend should use a lightweight query for non-SA users in "All Clients" view to avoid loading computed metrics for all clients at once.

**File:** `src/hooks/useDashboardTriage.ts`

Replace the `rawTenants` query with role-aware strategy:

```typescript
const { data: rawTenants = [], isLoading: tenantsLoading } = useQuery({
  queryKey: ['triage-attention-ranked', isSuperAdmin, savedView, profile?.user_uuid],
  queryFn: async () => {
    // SA or "My Clients": use the rich computed view
    if (isSuperAdmin || savedView === 'my_tenants') {
      let query = (supabase as any)
        .from('v_dashboard_attention_ranked')
        .select('*')
        .order('attention_score', { ascending: false });

      if (!isSuperAdmin && profile?.user_uuid) {
        query = query.eq('assigned_csc_user_id', profile.user_uuid);
      } else if (isSuperAdmin) {
        query = query.limit(500);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AttentionTenant[];
    }

    // Non-SA "All Clients": lightweight tenants list — sorted by name, no computed scores
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, status, lifecycle_status, risk_level, assigned_consultant_user_id, created_at')
      .eq('status', 'active')
      .not('is_system_tenant', 'eq', true)
      .order('name')
      .limit(500);

    if (error) throw error;

    return (data || []).map((t: any) => ({
      tenant_id: t.id,
      tenant_name: t.name,
      tenant_status: t.status,
      lifecycle_status: t.lifecycle_status,
      assigned_csc_user_id: t.assigned_consultant_user_id ?? null,
      risk_status: t.risk_level ?? 'stable',
      attention_score: 0,
      // all computed metrics default to 0 — user knows this is a basic view
      stage_score: 0, gaps_score: 0, risk_score: 0, staleness_score: 0,
      task_score: 0, renewal_score: 0, burn_score: 0,
      worst_stage_health_status: null, critical_stage_count: 0,
      at_risk_stage_count: 0, open_tasks_count: 0, overdue_tasks_count: 0,
      mandatory_gaps_count: 0, consult_hours_30d: 0, burn_risk_status: 'normal',
      retention_status: 'stable', high_severity_open_risks: 0,
      compliance_overdue_tasks: 0, compliance_blocked_tasks: 0, compliance_open_tasks: 0,
      days_since_activity: null, days_to_renewal: null, last_activity_at: null,
      renewal_window_start: null, attention_drivers_json: null, packages_json: null,
      risk_index: 0, risk_index_delta_14d: 0, composite_retention_risk_index: null,
      projected_exhaustion_date: null, abn: null, rto_id: null, cricos_id: null,
    })) as unknown as AttentionTenant[];
  },
  enabled: isVivacityStaff,
  staleTime: 60_000,
});
```

---

## Phase 3 — Fix stage status value inconsistency (Lovable DB migration)

**Run after Phase 1 has run at least once manually** — confirm what `run-stage-health-monitor` does with numeric status codes before patching.

`stage_instances.status` has mixed values:
- New format: `'not_started'`, `'in_progress'`, `'completed'`, `'na'`
- Legacy numeric: `'0'`, `'1'`, `'2'`, `'3'`, `'4'`, `'6'`

```sql
-- Backfill numeric codes to text equivalents
UPDATE public.stage_instances SET status = 'not_started'  WHERE status = '0';
UPDATE public.stage_instances SET status = 'not_started'  WHERE status = '1';
UPDATE public.stage_instances SET status = 'in_progress'  WHERE status = '2';
UPDATE public.stage_instances SET status = 'in_progress'  WHERE status = '3';
UPDATE public.stage_instances SET status = 'completed'    WHERE status = '4';
UPDATE public.stage_instances SET status = 'completed'    WHERE status = '6';
UPDATE public.stage_instances SET status = 'not_started'  WHERE status = 'Not Started';
```

> ⚠️ **Verify the numeric-to-text mapping with Angela/Carl before running.** The exact meaning of '0'–'6' depends on the legacy system. The mapping above is a best guess from context.

---

## Phase 4 — CSC data sync + dashboard discrepancy fixes (10 June 2026)

Post-deployment review surfaced three additional issues. All fixed same-day.

### 4A — CSC mismatch: `tenants.assigned_consultant_user_id` out of sync

**Problem:** `v_dashboard_tenant_portfolio` reads `tenants.assigned_consultant_user_id` for the CSC column. `tenant_csc_assignments` (canonical per `MEMORY.md`) had diverged — 20 of 61 active tenants pointed to the wrong CSC (mostly showing Jose Tinaja instead of AJ Delostrico). The dashboard portfolio and the client detail page showed different CSC names.

**Fix (direct SQL):**
```sql
UPDATE tenants t
SET assigned_consultant_user_id = tca.csc_user_id
FROM tenant_csc_assignments tca
WHERE tca.tenant_id = t.id
  AND tca.is_primary = true
  AND t.assigned_consultant_user_id IS DISTINCT FROM tca.csc_user_id
  AND t.status = 'active'
  AND COALESCE(t.is_system_tenant, false) = false;
```
Result: 0 mismatches remaining.

**Note:** `tenant_csc_assignments` is canonical. `tenants.assigned_consultant_user_id` must be kept in sync. A trigger to auto-sync on `tenant_csc_assignments` INSERT/UPDATE/DELETE would prevent future drift — not yet added, flag for future sprint.

### 4B — `v_dashboard_labour_efficiency` stale role list

**Problem:** The view filtered `WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')` — CSC, BGT, Integrator, CET all excluded. AJ, Sharwari, Samantha, Kelly showed 0 clients. "Avg Clients/CSC" KPI showed 3 instead of ~12.

**Fix (direct SQL — view recreated):** Updated WHERE clause to include all RBAC v5 internal roles:
```sql
WHERE u.unicorn_role = ANY (ARRAY[
  'Super Admin', 'Team Leader', 'Team Member',
  'Integrator', 'BGT', 'CSC', 'CET'
])
```
Result: Sharwari 18 clients, Samantha 17, AJ 14, Angela 6, Kelly 6. Total = 61 ✓.

### 4C — `useDashboardTriage.ts` lightweight fallback removed

**Problem:** The Phase 2 fix introduced a lightweight `tenants` table query for non-SA "All Clients" view to avoid timeout. After Phase 0 reduced the view to 61 rows (11ms execution), the lightweight branch was no longer needed. Non-SA users saw Score=0/Healthy everywhere instead of real computed metrics.

**Fix (Lovable — deployed):** Removed the branched query entirely. All staff roles now query `v_dashboard_attention_ranked` directly. `savedView` filtering for My Clients / All Clients remains client-side in `filteredTenants`.

### 4D — `LabourEfficiencyPanel.tsx` avgClients denominator bug

**Problem:** `avgClients` divides by `metrics.length` (all internal staff, ~20 rows including those with 0 clients), giving 61/20 ≈ 3. Should divide by active CSCs only.

**Fix (Lovable — pending as at 10 June 2026):**
```typescript
// In src/components/dashboard/LabourEfficiencyPanel.tsx
const activeCscs = metrics.filter(m => Number(m.client_count) > 0).length;
const avgClients = activeCscs > 0 ? Math.round(totalClients / activeCscs) : 0;
```

---

## Open questions

- [x] Confirm numeric status code mapping for `stage_instances` before Phase 3 — confirmed and applied
- [x] Confirm `client_action_items` column names before Phase 0 Change C — confirmed
- [x] Replace `<SERVICE_ROLE_KEY>` in Phase 1 cron SQL — done
- [x] After Phase 1 cron jobs run: check numeric status codes — Phase 3 fixed all
- [ ] **Future sprint:** Add trigger on `tenant_csc_assignments` to keep `tenants.assigned_consultant_user_id` in sync automatically — prevents Phase 4A recurrence
- [x] **`LabourEfficiencyPanel.tsx` avgClients denominator fix** (Phase 4D) — deployed, commit `c9f46f8f` on `origin/main`
