
## Implementation (ready to build)

Single migration, single transaction, 12 objects. Then 2 frontend file edits. Then run the verification block and report results.

### Migration (one file, one transaction)

For every view, full body is replayed verbatim from `pg_get_viewdef` with only the targeted `WHERE` change. Reloptions preserved per the table below.

| # | Object | Change | `WITH` clause |
|---|---|---|---|
| 1 | `get_client_package_dashboard` (FUNCTION) | `hours_agg` WHERE: append `AND te.is_billable = true` | `STABLE SECURITY DEFINER SET search_path = 'public','app' SET row_security = 'off'` preserved |
| 2 | `v_client_package_hours_timeline` | `daily` WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 3 | `v_client_package_hours_by_type` | `per_entry` WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 4 | `v_client_package_hours_recent` | **No filter change.** Add `te.is_billable` to `ranked` CTE; project as trailing column. | `WITH (security_invoker = true)` |
| 5 | `v_predictive_signal_inputs` | `burn_30d` WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 6 | `v_package_burndown` | time-entry agg WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 7 | `v_package_time_summary` | `hours` CTE WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 8 | `v_dashboard_weekly_wins` | time-entry agg WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 9 | `v_dashboard_tenant_portfolio` | time-entry agg WHERE: append `AND te.is_billable = true` | **No `WITH` clause** — preserve existing (no reloptions) |
| 10 | `v_admin_zero_progress_packages` | (no time agg in body) — confirmed: `hours` CTE only filters `package_instance_id IS NOT NULL`. Add `AND te.is_billable = true`. | `WITH (security_invoker = true)` |
| 11 | `v_client_package_dashboard` (legacy view) | time-entry agg WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |
| 12 | `v_client_home_feed` | `te_recent` CTE WHERE: append `AND te.is_billable = true` | `WITH (security_invoker = true)` |

Defensive `GRANT SELECT ... TO authenticated` re-issued per view; `GRANT EXECUTE ... TO authenticated` on the RPC.

`is_billable` confirmed `NOT NULL DEFAULT true`, live `NULL` count = 0 — `= true` filter is safe.

### Frontend (after migration approved and types regen)

1. **`src/hooks/use-client-package-hours-recent.ts`** — add `is_billable: boolean;` to `ClientPackageHoursRecentRow`.
2. **`src/components/client/package-dashboard/PackageRecentWork.tsx`** — render `<Badge variant="secondary" className="text-[10px]">Included</Badge>` inline next to the work-type label when `e.is_billable === false`.

### Post-deploy verification (will run and report verbatim)

```sql
-- A. security_invoker preserved on 10 invoker views; absent on v_dashboard_tenant_portfolio
SELECT relname, reloptions FROM pg_class
WHERE relnamespace='public'::regnamespace
  AND relname IN ('v_client_package_hours_timeline','v_client_package_hours_by_type',
                  'v_client_package_hours_recent','v_predictive_signal_inputs',
                  'v_package_burndown','v_package_time_summary','v_dashboard_weekly_wins',
                  'v_admin_zero_progress_packages','v_client_package_dashboard',
                  'v_client_home_feed','v_dashboard_tenant_portfolio')
ORDER BY relname;

-- B. Filter present in 10 view definitions (all except v_client_package_hours_recent)
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND c.relname IN ('v_client_package_hours_timeline','v_client_package_hours_by_type',
                    'v_predictive_signal_inputs','v_package_burndown','v_package_time_summary',
                    'v_dashboard_weekly_wins','v_admin_zero_progress_packages',
                    'v_client_package_dashboard','v_client_home_feed','v_dashboard_tenant_portfolio')
  AND pg_get_viewdef(c.oid,true) ILIKE '%is_billable = true%'
ORDER BY c.relname;

-- C. RPC contains the filter
SELECT pg_get_functiondef('public.get_client_package_dashboard(bigint,bigint)'::regprocedure)
       ILIKE '%is_billable = true%' AS rpc_filter_present;

-- D. is_billable column present on v_client_package_hours_recent
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='v_client_package_hours_recent' AND column_name='is_billable';

-- E. Numeric sanity (rpc_hours == billable_hours < all_hours)
SELECT pi.id,
       (SELECT hours_used FROM public.get_client_package_dashboard(pi.tenant_id, pi.id)) AS rpc_hours,
       round(sum(te.duration_minutes) FILTER (WHERE te.is_billable)::numeric/60.0, 2) AS billable_hours,
       round(sum(te.duration_minutes)::numeric/60.0, 2) AS all_hours
FROM public.package_instances pi
JOIN public.time_entries te ON te.package_instance_id = pi.id
WHERE pi.is_complete=false AND te.duration_minutes>0
GROUP BY pi.id, pi.tenant_id
HAVING sum(te.duration_minutes) FILTER (WHERE NOT te.is_billable) > 0
LIMIT 5;
```

### Rollback

Pre-change DDL captured in the migration as commented blocks. Rollback = paste prior DDL into a new migration. No data risk.

Approve to switch to build mode and I'll execute.
