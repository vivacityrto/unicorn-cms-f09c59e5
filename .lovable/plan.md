## Summary

Create a new tenant-scoped `SECURITY DEFINER` RPC `public.get_client_package_dashboard(p_tenant_id, p_package_instance_id)` that mirrors `v_client_package_dashboard` but starts from an `allowed_packages` CTE so all aggregates touch only the caller's packages. Switch the two client hooks to call the RPC. Leave the existing view in place for backward compatibility.

## Pre-flight findings (must address)

1. **Column type mismatch in your spec.** Verified against `pg_attribute` for `v_client_package_dashboard`:
   - `hours_included` is `integer` (your spec says `numeric`)
   - `hours_added` is `integer` (your spec says `numeric`)
   The other 26 columns match. The `RETURNS TABLE` will use **`integer`** for those two so the row shape stays byte-identical to the view. Frontend `ClientPackageDashboardRow` already declares them as `number`, so no TS change.

2. **`client_action_items.tenant_id` is `integer`**, not `bigint`. The new `action_items_agg` no longer references `cai.tenant_id` at all (it filters via `cai.package_id IN allowed_packages`), so the cast disappears cleanly.

3. **`notes.tenant_id` is `bigint`** — direct `n.tenant_id = p_tenant_id` filter is type-safe and uses `notes_tenant_id_idx`.

4. **`packageinstance_id`/`package_instance_id` casing.** `stage_instances.packageinstance_id`, `time_entries.package_instance_id`, `client_action_items.package_id`, `notes.parent_id` — all `bigint`. Confirmed.

5. **Authorization gate semantics.** `app.user_can_access_tenant(p_tenant_id)` reads `auth.uid()` from the JWT. Because the function is `SECURITY DEFINER` with `row_security = off`, it bypasses base-table RLS *only after* the gate passes. SuperAdmin/Vivacity-team/tenant-user paths inside the helper are preserved.

6. **No other consumer reads `v_client_package_dashboard`.** Confirmed via repo grep — only `use-client-package-dashboard.ts`. The view stays as-is for safety.

7. **Postgres typing rule:** because the function is `LANGUAGE sql` with `RETURNS TABLE`, every output expression is forced to the declared column type. Numeric columns must be cast explicitly where the source is `integer` (e.g. `hours_included`, `hours_added`, `hours_total`, `hours_used`, `hours_remaining`, `hours_pct_used`). The current view already does this; we copy verbatim.

8. **`statement_timeout = 60s`** is fine for `CREATE FUNCTION` (DDL is cheap). Keep `lock_timeout = 3s`.

## Migration (new file)

```sql
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id           bigint,
  p_package_instance_id bigint DEFAULT NULL
)
RETURNS TABLE (
  package_instance_id     bigint,
  tenant_id               bigint,
  package_name            text,
  package_type            text,
  progress_mode           text,
  manager_id              uuid,
  is_complete             boolean,
  start_date              date,
  end_date                date,
  hours_included          integer,
  hours_added             integer,
  hours_total             numeric,
  hours_used              numeric,
  hours_remaining         numeric,
  hours_pct_used          numeric,
  stages_total            integer,
  stages_complete         integer,
  current_stage_sortorder integer,
  open_tasks              integer,
  overdue_tasks           integer,
  last_activity_at        timestamptz,
  pinned_note_title       text,
  pinned_note_text        text,
  pinned_note_priority    text,
  pinned_note_updated_at  timestamptz,
  pinned_note_severity    text,
  status_pill             text,
  current_stage_shortname text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
SET row_security = off
AS $$
  WITH allowed_packages AS (
    SELECT pi.*
      FROM public.package_instances pi
     WHERE pi.tenant_id = p_tenant_id
       AND (p_package_instance_id IS NULL OR pi.id = p_package_instance_id)
       AND app.user_can_access_tenant(p_tenant_id)
  ),
  stage_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS stages_total,
           count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
           min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder,
           max(si.updated_at) AS stage_last_updated
      FROM public.stage_instances si
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
     GROUP BY si.packageinstance_id
  ),
  current_stage AS (
    SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
           COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS shortname
      FROM public.stage_instances si
      JOIN public.stages s ON s.id = si.stage_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3])))
       AND COALESCE(s.is_archived, false) = false
       AND COALESCE(s.is_audit_workspace, false) = false
     ORDER BY si.packageinstance_id, si.stage_sortorder
  ),
  action_items_agg AS (
    SELECT cai.package_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND (COALESCE(cai.status, 'open') <> ALL (ARRAY['completed','cancelled']))
     GROUP BY cai.package_id
  ),
  task_instances_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
           max(cti.updated_at) AS last_updated
      FROM public.client_task_instances cti
      JOIN public.stage_instances si ON si.id = cti.stageinstance_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND COALESCE(cti.is_archived, false) = false
       AND cti.completion_date IS NULL
       AND COALESCE(cti.status, 0) <> 2
       AND COALESCE(si.released_client_tasks, false) = true
     GROUP BY si.packageinstance_id
  ),
  tasks_agg AS (
    SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
           COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0)       AS open_tasks,
           COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
           GREATEST(a.last_updated, t.last_updated)                    AS tasks_last_updated
      FROM action_items_agg a
      FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
  ),
  notes_agg AS (
    SELECT n.parent_id AS package_instance_id,
           max(n.updated_at) AS notes_last_updated
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     GROUP BY n.parent_id
  ),
  pinned AS (
    SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
           n.title         AS pinned_note_title,
           n.note_details  AS pinned_note_text,
           n.priority      AS pinned_note_priority,
           n.updated_at    AS pinned_note_updated_at
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.is_pinned = true
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
  ),
  hours_agg AS (
    SELECT te.package_instance_id,
           COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND (ap.start_date IS NULL OR te.start_at >= ap.start_date)
     GROUP BY te.package_instance_id
  ),
  most_recent_activity AS (
    SELECT pi.id AS package_instance_id,
           COALESCE(
             GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated, ha.max_te_at),
             pi.start_date::timestamptz
           ) AS last_activity_at
      FROM allowed_packages pi
      LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
      LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
      LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
      LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  )
  SELECT pi.id AS package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
         p.package_type,
         p.progress_mode,
         pi.manager_id,
         pi.is_complete,
         pi.start_date,
         pi.end_date,
         COALESCE(pi.hours_included, 0) AS hours_included,
         COALESCE(pi.hours_added, 0)    AS hours_added,
         (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
         COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric
                  - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
         CASE
           WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
           ELSE round(COALESCE(ha.hours_used_calc, 0::numeric)
                      / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total, 0)    AS stages_total,
         COALESCE(sa.stages_complete, 0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks, 0)    AS open_tasks,
         COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
         mra.last_activity_at,
         pn.pinned_note_title,
         pn.pinned_note_text,
         pn.pinned_note_priority,
         pn.pinned_note_updated_at,
         CASE
           WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'hold'
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) ~ '(urgent|overdue)' THEN 'urgent'
           ELSE 'info'
         END AS pinned_note_severity,
         CASE
           WHEN pn.pinned_note_text IS NOT NULL
                AND lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
           WHEN pi.is_complete = true THEN 'complete'
           WHEN mra.last_activity_at < (now() - interval '30 days')
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75)
                OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'
           ELSE 'on_track'
         END AS status_pill,
         cs.shortname AS current_stage_shortname
    FROM allowed_packages pi
    JOIN public.packages p              ON p.id = pi.package_id
    LEFT JOIN stage_agg sa              ON sa.package_instance_id = pi.id
    LEFT JOIN current_stage cs          ON cs.packageinstance_id = pi.id
    LEFT JOIN tasks_agg ta              ON ta.package_instance_id = pi.id
    LEFT JOIN notes_agg na              ON na.package_instance_id = pi.id
    LEFT JOIN pinned pn                 ON pn.package_instance_id = pi.id
    LEFT JOIN hours_agg ha              ON ha.package_instance_id = pi.id
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated;
```

Notes on the SQL above:
- Column ordering, naming, casts, COALESCE/CASE logic, `status_pill` thresholds, and `most_recent_activity` semantics are byte-identical to the current view.
- `status_pill` second branch is parenthesised explicitly to match the operator precedence the view's planner produces (the view uses raw `OR …AND…` chains; PG resolves AND before OR — same result, but the parens make it auditable).
- `notes_agg` and `pinned` filter on `n.tenant_id = p_tenant_id` directly to use `notes_tenant_id_idx` instead of an `IN` against `allowed_packages` — both are correct because notes are tenant-scoped.
- `hours_agg` joins `allowed_packages` for `start_date` (replacing the old `pi2` join) and avoids the helper call entirely.
- `REVOKE … FROM PUBLIC` is added defensively; only `authenticated` may execute.

## Frontend diff: `src/hooks/use-client-package-dashboard.ts`

Single-row hook (lines 56-77 region):
```ts
return useQuery({
  queryKey: ['client_package_dashboard', activeTenantId, packageInstanceId],
  enabled: !!activeTenantId && !!packageInstanceId,
  staleTime: 30_000,
  retry: 1,
  queryFn: async (): Promise<ClientPackageDashboardRow | null> => {
    if (!activeTenantId || !packageInstanceId) return null;
    const { data, error } = await (supabase as any)
      .rpc('get_client_package_dashboard', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: packageInstanceId,
      })
      .maybeSingle();
    if (error) throw error;
    return (data as ClientPackageDashboardRow | null) ?? null;
  },
});
```

List hook (lines 81-102 region):
```ts
return useQuery({
  queryKey: ['client_package_dashboards', activeTenantId],
  enabled: !!activeTenantId,
  staleTime: 30_000,
  retry: 1,
  queryFn: async (): Promise<ClientPackageDashboardRow[]> => {
    if (!activeTenantId) return [];
    const { data, error } = await (supabase as any)
      .rpc('get_client_package_dashboard', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: null,
      });
    if (error) throw error;
    return (data ?? []) as ClientPackageDashboardRow[];
  },
});
```

No other files change. `ClientPackagesPage.tsx` already has the destructive error card from the previous turn.

## Why this fixes the timeout

- The view as it stands is `security_invoker = on`, so under a real client JWT the planner must evaluate the per-row RLS policies on `client_task_instances`, `stage_instances`, `notes`, `time_entries` while building the CTEs. With ~22.7k task-instance rows the policy `IN (… JOIN package_instances …)` re-evaluates `app.user_can_access_tenant` enough times to exceed `statement_timeout`. Staff impersonation hides this because `app.is_vivacity_team()` short-circuits the helper to `true`.
- The RPC switches to `SECURITY DEFINER` + `row_security = off`, so RLS is replaced by a single `app.user_can_access_tenant(p_tenant_id)` call inside `allowed_packages`. Every downstream CTE now constrains to ≤ a few hundred rows by package id before any aggregation.

## Risk assessment

- **Security:** equal to current. The only privilege bypass is base-table RLS, gated by the same canonical helper used by every existing policy. No write surface added (function is read-only). `EXECUTE` granted only to `authenticated`.
- **Tenancy isolation:** stronger. Caller can only see rows matching `p_tenant_id`, AND the JWT must satisfy `app.user_can_access_tenant`. Cross-tenant probing returns zero rows.
- **Backward compatibility:** the existing view, GRANT, and any unknown future consumers are untouched. Frontend types unchanged. RLS policies, FKs, triggers untouched.
- **Performance:** for Brian's tenants this drops the working set from full-table to ≤ 4 packages / ≤ 23 stages / ≤ 63 task instances / ≤ 17 time entries. Sub-second expected.
- **Rollback:** `DROP FUNCTION public.get_client_package_dashboard(bigint, bigint);` and revert the two hook functions to their previous `.from(VIEW)` calls.

Approve and I'll apply the migration plus the hook edits in one pass.