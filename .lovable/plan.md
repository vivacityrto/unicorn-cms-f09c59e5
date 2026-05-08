## Why

`v_client_package_dashboard` is `security_invoker=on`. Under a real client login, RLS evaluates per-row on six base tables, and the `client_task_instances` policy nests two correlated `IN (SELECT … WHERE app.user_can_access_tenant(…))` subqueries around a `SECURITY DEFINER` helper the planner cannot inline. With ~22.8k task-instance rows, the view exceeds `statement_timeout` and returns Postgres error 57014. Staff impersonation hides the bug because `is_vivacity_team_safe()` short-circuits each policy to `true`, eliminating the per-row helper calls.

Fix: pre-filter every heavy CTE by `app.user_can_access_tenant(tenant_id)` so the helper is invoked once per tenant (~1 call) rather than effectively once per child row (~30k calls). Result-set semantics are unchanged — RLS is still the security boundary; we are just giving the planner the predicate it can't derive on its own.

## Migration

New file: `supabase/migrations/<ts>_fix_client_package_dashboard_perf.sql`

```sql
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE VIEW public.v_client_package_dashboard
WITH (security_invoker = on) AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::int AS stages_total,
         count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2,3]))::int AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR si.status_id <> ALL (ARRAY[2,3])) AS current_stage_sortorder,
         max(si.updated_at) AS stage_last_updated
    FROM stage_instances si
    JOIN package_instances pi ON pi.id = si.packageinstance_id          -- NEW
   WHERE app.user_can_access_tenant(pi.tenant_id)                        -- NEW
   GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
         COALESCE(NULLIF(TRIM(s.shortname), ''), s.name) AS shortname
    FROM stage_instances si
    JOIN stages s              ON s.id = si.stage_id
    JOIN package_instances pi  ON pi.id = si.packageinstance_id          -- NEW
   WHERE (si.status_id IS NULL OR si.status_id <> ALL (ARRAY[2,3]))
     AND COALESCE(s.is_archived, false) = false
     AND COALESCE(s.is_audit_workspace, false) = false
     AND app.user_can_access_tenant(pi.tenant_id)                        -- NEW
   ORDER BY si.packageinstance_id, si.stage_sortorder
), action_items_agg AS (
  SELECT cai.package_id AS package_instance_id,
         count(*)::int AS open_count,
         count(*) FILTER (WHERE cai.due_date < now()::date)::int AS overdue_count,
         max(cai.updated_at) AS last_updated
    FROM client_action_items cai
   WHERE cai.package_id IS NOT NULL
     AND cai.completed_at IS NULL
     AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     AND app.user_can_access_tenant(cai.tenant_id)                       -- NEW
   GROUP BY cai.package_id
), task_instances_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::int AS open_count,
         count(*) FILTER (WHERE cti.due_date < now())::int AS overdue_count,
         max(cti.updated_at) AS last_updated
    FROM client_task_instances cti
    JOIN stage_instances si    ON si.id = cti.stageinstance_id
    JOIN package_instances pi  ON pi.id = si.packageinstance_id          -- NEW
   WHERE COALESCE(cti.is_archived,false) = false
     AND cti.completion_date IS NULL
     AND COALESCE(cti.status,0) <> 2
     AND COALESCE(si.released_client_tasks,false) = true
     AND app.user_can_access_tenant(pi.tenant_id)                        -- NEW
   GROUP BY si.packageinstance_id
), tasks_agg AS ( … unchanged … ),
notes_agg AS (
  SELECT n.parent_id AS package_instance_id, max(n.updated_at) AS notes_last_updated
    FROM notes n
   WHERE n.parent_type = 'package_instance'
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)                         -- NEW
   GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
         n.title, n.note_details, n.priority, n.updated_at
    FROM notes n
   WHERE n.parent_type = 'package_instance'
     AND n.is_pinned = true
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)                         -- NEW
   ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
), hours_agg AS (
  SELECT te.package_instance_id,
         COALESCE(sum(te.duration_minutes),0)::numeric / 60.0 AS hours_used_calc,
         max(te.start_at) AS max_te_at
    FROM time_entries te
    JOIN package_instances pi2 ON pi2.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date)
     AND app.user_can_access_tenant(pi2.tenant_id)                       -- NEW
   GROUP BY te.package_instance_id
), most_recent_activity AS ( … unchanged … )
SELECT … unchanged outer SELECT, joins, COALESCE/CASE, status_pill, all aliases …
FROM package_instances pi
JOIN packages p ON p.id = pi.package_id
LEFT JOIN stage_agg sa            ON sa.package_instance_id = pi.id
LEFT JOIN current_stage cs        ON cs.packageinstance_id = pi.id
LEFT JOIN tasks_agg ta            ON ta.package_instance_id = pi.id
LEFT JOIN notes_agg na            ON na.package_instance_id = pi.id
LEFT JOIN pinned pn               ON pn.package_instance_id = pi.id
LEFT JOIN hours_agg ha            ON ha.package_instance_id = pi.id
LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;

GRANT SELECT ON public.v_client_package_dashboard TO authenticated;
```

Outer SELECT, all column aliases, ordering, COALESCE/CASE/`status_pill`, and `most_recent_activity` are byte-identical to the current definition (captured at line 73-122 of `pg_get_viewdef`).

## Frontend changes

### `src/hooks/use-client-package-dashboard.ts`
Add `retry: 1` to both `useClientPackageDashboard` and `useClientPackageDashboards` `useQuery` configs (alongside `staleTime`). One hard retry on hard backend failure, then surface the error.

### `src/components/client/ClientPackagesPage.tsx`
- Line 27: destructure `error`:
  ```tsx
  const { data: dashboards = [], isLoading, error } = useClientPackageDashboards();
  ```
- After the `if (isLoading)` block (after line 88), add:
  ```tsx
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          <p className="text-sm font-medium">Couldn't load packages — refresh to try again.</p>
        </CardContent>
      </Card>
    );
  }
  ```

No other files change. The inner `PackageCard` already handles `dashboardError` for `useClientPackageDashboard`.

## Deep-dive notes / nuances

- **RLS unchanged.** No policy on `package_instances`, `stage_instances`, `client_task_instances`, `client_action_items`, `notes`, or `time_entries` is altered. The new `WHERE app.user_can_access_tenant(…)` predicates are a strict subset of (in fact, redundant under) the existing RLS — they only redistribute when the helper runs.
- **`notes.tenant_id`, `client_action_items.tenant_id`, `client_task_instances → stage_instances → package_instances.tenant_id`, `time_entries → package_instances.tenant_id`** are the canonical scoping joins; verified to exist with NOT-NULL semantics on all package-scoped rows.
- **`security_invoker = on` is preserved** so RLS continues to evaluate as the calling user. Cross-tenant leak is impossible.
- **Staff impersonation path** (`is_vivacity_team_safe()` returning true) still works — the new predicates short-circuit to true for staff exactly as before, so impersonation latency is unaffected.
- **Plan-mode (preview) clients** that lack a `tenant_users` row will continue to receive zero rows — empty state, not error.
- **Outer view shape preserved**: 24 columns in identical order/types. `useClientPackageDashboard*` selectors and the `ClientPackageDashboardRow` interface remain valid; no FE refetch / no Supabase types regen needed (we're not changing column metadata, only CTE bodies).
- **Performance**: helper invocation drops from ~O(rows in 6 tables) to ~O(distinct tenants in `package_instances`) — the dominant cost in `client_task_instances` (22.8k rows) is removed.
- **Lock/statement timeouts**: `lock_timeout=3s`, `statement_timeout=15s` set `LOCAL` — `CREATE OR REPLACE VIEW` only takes a brief AccessExclusive on the view definition; well within budget.
- **Linter** noise expected: existing pre-merge warnings (`security_definer_view`, search_path) on unrelated views are unchanged by this migration.

## Rollback

Re-run the prior `CREATE OR REPLACE VIEW public.v_client_package_dashboard` body from migration `20260502074914`. View signature is unchanged so rollback is non-breaking.

## Verification

1. As Brian (`briansismundo@gmail.com`, tenant 7533): `/client/packages` returns the "Compliance Health Check" card under ~1s, no 57014.
2. Impersonating staff: same card renders identically.
3. `EXPLAIN ANALYZE SELECT * FROM v_client_package_dashboard WHERE tenant_id = 7533` under the client role completes in <2s.
4. Tenants with no packages → empty state (unchanged).
5. Hard backend failure → destructive card instead of infinite skeleton.

## Risk

Low. View-only change, semantics-preserving, RLS preserved, FE changes are additive (`retry` count + error branch). No FK, trigger, table, or policy modifications. Reversible by replaying the previous view body.
