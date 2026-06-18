## Phase 2d — Rewrite `v_client_reporting_reminders` to use FK joins

### Goal
Internally rewire the view to derive `audience` and `recurrence` from `dd_obligation_audience.value` / `dd_obligation_recurrence.value` via the new FK columns, while keeping the output 100% byte-identical (same 14 columns, names, types, order). No consumer or frontend hook changes.

### Migration
`CREATE OR REPLACE VIEW public.v_client_reporting_reminders AS` with:

- `tenant_audience` CTE unchanged in semantics, now reading `public.tenants`.
- `obligations_with_dates` CTE joins `public.compliance_obligations o` to:
  - `public.dd_obligation_audience a ON a.id = o.audience_id` → `a.value AS audience`
  - `public.dd_obligation_recurrence r ON r.id = o.recurrence_id` → `r.value AS recurrence`
  - All `o.recurrence = '…'` comparisons replaced with `r.value = '…'`.
  - All date math uses `(pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date` in place of `now()::date`.
- Outer SELECT preserves the exact 14-column shape and order: `tenant_id, obligation_id, code, title, description, audience, recurrence, next_date, window_opens_at, cta_label, cta_url, sort_order, days_until, status`.
- Status bucketing logic unchanged (always_open / rolling_per_tenant / no_date / overdue / due_soon / upcoming), still keyed off `recurrence` (now sourced from `r.value`).
- Tenant audience filter unchanged (`rto`, `cricos`, `rto_or_cricos`).
- `ORDER BY ta.tenant_id, o.sort_order` preserved.
- All table references fully schema-qualified (`public.*`).
- `WHERE o.is_active = true` preserved.

### Verification (hard gate)
1. `SELECT count(*) FROM public.v_client_reporting_reminders` → must equal **2247**.
2. `information_schema.columns` for the view, ordered by `ordinal_position`, must match the preflight 14-column shape exactly.
3. `SELECT count(*) FROM public.v_client_reporting_reminders WHERE audience IS NULL OR recurrence IS NULL` → must equal **0**.

If any check fails, roll back immediately.

### Rollback
Legacy `o.audience` / `o.recurrence` text columns still exist at this point (dropped only in Phase 2e). A single `CREATE OR REPLACE VIEW` reinstating the original body (captured from `pg_get_viewdef` snapshot above) restores prior behavior.

### Out of scope
- Phase 2e (drop legacy text columns).
- Any frontend changes; `use-client-reporting-reminders.ts` is not touched.
- RLS, grants, or signature changes.
