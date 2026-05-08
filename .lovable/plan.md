## Bug fix: Dashboard "No activity for 999 days" for active clients

### Root cause (confirmed against live DB)
`v_dashboard_tenant_portfolio.last_activity_at` is computed as:
```sql
GREATEST(tk.latest_task_at, cl.latest_consult_at::timestamptz, eg.latest_gap_at)
```
- Only 3 sources (tasks, consult logs, evidence-gap checks).
- The `cl` lateral filters `c.date >= now() - '30 days'`, so `latest_consult_at` is capped at 30 days.
- When a tenant has no rows in any of the 3 sources within scope, `GREATEST(NULL, NULL, NULL) = NULL`.
- Downstream `v_dashboard_attention_ranked` converts NULL → `999` days, producing "No activity for 999 days".

`v_tenant_last_activity` already aggregates 6 sources with `COALESCE` floors and `t.created_at` fallback, so it is **never NULL** and has no time cap.

### Change (single migration, view replacement only)
`CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio` — identical to the current definition except:

1. Add at end of FROM clause:
   ```sql
   LEFT JOIN public.v_tenant_last_activity tla ON tla.tenant_id = t.id
   ```
2. Replace the `last_activity_at` projection:
   ```sql
   tla.last_activity_at AS last_activity_at
   ```

All other columns, lateral joins (`ri`, `sh`, `tk`, `eg`, `cl`, `bf`, `rf`), the WHERE clause (`lifecycle_status IN ('active','suspended')` and non-system tenant filter), and column ordering remain byte-for-byte the same. The `tk.latest_task_at`, `cl.latest_consult_at`, `eg.latest_gap_at` subselect fields stay in place (they are only consumed by the dropped `GREATEST` and removing them is unnecessary and risks breaking other consumers' assumptions about laterals — though no other consumer reads them, leaving them is the safer no-op).

Run the migration in a single transaction with:
```sql
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
```

### Verification queries (post-apply)
1. Column shape unchanged:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'v_dashboard_tenant_portfolio' ORDER BY ordinal_position;
   ```
2. NULL `last_activity_at` count drops to 0:
   ```sql
   SELECT COUNT(*) FILTER (WHERE last_activity_at IS NULL) AS null_count,
          COUNT(*) AS total
   FROM v_dashboard_tenant_portfolio;
   ```
3. Spot-check an affected tenant (previously NULL → now ≤ today):
   ```sql
   SELECT tenant_id, tenant_name, last_activity_at,
          (now() - last_activity_at) AS age
   FROM v_dashboard_tenant_portfolio ORDER BY last_activity_at NULLS FIRST LIMIT 20;
   ```
4. `v_dashboard_attention_ranked.days_since_activity` no longer returns 999 for active tenants:
   ```sql
   SELECT COUNT(*) FILTER (WHERE days_since_activity = 999) FROM v_dashboard_attention_ranked;
   ```

### Impact analysis

**Consumers of `v_dashboard_tenant_portfolio.last_activity_at`:**
- `v_dashboard_attention_ranked` — uses it to compute `days_since_activity`; semantics improve (real values instead of NULL→999).
- `v_dashboard_behavioural_prompts` — same; improves.
- `usePortfolioCockpit.ts` — reads field directly; type unchanged (`timestamptz`), value now non-NULL. No FE change required.
- `useDashboardTriage.ts` — reads `days_since_activity` only; benefits transitively.

**Out of scope / unchanged:**
- `v_tenant_last_activity` (source of truth)
- `v_dashboard_attention_ranked`, `v_dashboard_behavioural_prompts`, `v_dashboard_labour_efficiency`
- All RLS, triggers, FKs, table structures
- All frontend files

### Edge cases & correctness
- `v_tenant_last_activity` floors with `t.created_at` and `'1970-01-01'`, so `last_activity_at` is always non-NULL — the 999 sentinel will not fire for tenants present in `tenants`.
- LEFT JOIN on `tenant_id` (bigint, PK of `tenants` and grouping key in `v_tenant_last_activity`) is strictly 1:1 — no row multiplication.
- `v_tenant_last_activity` scans all tenants (no lifecycle filter); the outer view's `WHERE` still restricts to `active`/`suspended` non-system tenants, so result-set cardinality is unchanged.
- Permissions: `CREATE OR REPLACE VIEW` preserves existing grants and RLS posture (views inherit RLS via underlying tables; `v_tenant_last_activity` reads tables already accessible to dashboard consumers — no privilege escalation).
- Backward-compatible: column name, position, and type (`timestamp with time zone`) unchanged.

### Risk assessment
- **Schema risk:** None. View signature preserved.
- **Performance risk:** Low. `v_tenant_last_activity` runs 5 correlated `max()` subqueries per tenant. Dashboard view is already lateral-heavy and tenant-bounded; the additional 1:1 join adds bounded work. If observed regression occurs, a future optimisation is to materialise `v_tenant_last_activity` or add `(tenant_id, updated_at DESC)` indexes on `document_instances`, `notes`, `meetings`, `email_messages`, `consult_logs` — out of scope for this fix.
- **Data risk:** None. Read-only view; no data mutation.
- **Rollback:** Re-run the prior `CREATE OR REPLACE VIEW` definition (captured above in this plan) to restore.

### Migration file
`supabase/migrations/<timestamp>_fix_dashboard_last_activity.sql` containing the single `CREATE OR REPLACE VIEW` inside a transaction with the lock/statement timeouts above.
