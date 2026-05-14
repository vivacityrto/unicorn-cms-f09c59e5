## Migrate `task_status` enum → `dd_task_status` lookup table

### Pre-flight notes (from blast-radius audit)

- The Postgres enum `public.task_status` is **not** referenced by the codebase (0 hits across src, supabase/migrations, supabase/functions, tests). It also does not appear among the `CREATE TYPE` statements in any migration. The migration is therefore additive — it creates a `dd_` lookup with no risk of disturbing existing code paths.
- `useTaskStatusOptions()` already follows the lookup pattern (string `value` keys + `label`), so once `dd_task_status` exists with the seeded rows, the hook becomes the canonical source.
- Two consumer hooks (`useClientTaskInstances.ts`, `useStaffTaskInstances.ts`) already work via `status_id` / `status` text columns — no enum dependency.
- No `=== 'backlog'` style hard-coded comparisons exist for these values that would be tied to a `task_status` enum specifically.

### What this migration does

1. Creates `public.dd_task_status` using the `dd_accounting_system` standard shape (`id serial PK`, `value text UNIQUE`, `label text`, `sort_order int`, `is_active boolean`, `created_at timestamptz`).
2. Seeds the six rows byte-identical to the enum value names.
3. Enables RLS with two policies: `SELECT` for `authenticated`, full write for `service_role` only.
4. Adds an index on `(sort_order)` for ordered fetches and on `(is_active)` for the common filter.
5. Runs in-transaction safety checks via `DO $$ ... ASSERT ... $$;` blocks. If any assertion fails, the whole migration rolls back automatically.
6. Leaves the legacy `public.task_status` enum (if it exists) entirely alone for rollback safety.

### What this migration does NOT do

- Does **not** `DROP TYPE public.task_status` — kept for rollback.
- Does **not** alter, add, or drop any column on any other table.
- Does **not** modify any RLS policy on any other object.
- Does **not** touch UI components, hooks, badges, dropdowns, filters, or stats — labels remain identical because the seeded `label` values match the existing rendered text (`Backlog`, `Not Started`, `In Progress`, `Blocked`, `Completed`, `Cancelled`).

### Rollback

```sql
DROP TABLE IF EXISTS public.dd_task_status;
-- Legacy public.task_status enum (if present) remains intact and untouched.
```

No data loss, no cascading failures — `dd_task_status` is a brand-new isolated object with no FK dependencies.

### Post-deploy verification checklist

1. `SELECT count(*) FROM public.dd_task_status;` → **6**
2. `SELECT count(DISTINCT value) FROM public.dd_task_status WHERE value IN ('backlog','not_started','in_progress','blocked','completed','cancelled');` → **6**
3. `SELECT count(*) FROM public.dd_task_status WHERE value IS NULL OR label IS NULL OR sort_order IS NULL OR is_active IS NULL;` → **0**
4. `SELECT array_agg(sort_order ORDER BY sort_order) FROM public.dd_task_status;` → `{0,1,2,3,4,5}`
5. `SELECT relrowsecurity FROM pg_class WHERE relname = 'dd_task_status';` → `true`
6. `SELECT polname, polroles::regrole[] FROM pg_policy WHERE polrelid = 'public.dd_task_status'::regclass;` → at least one SELECT policy for `authenticated`, write policies restricted to `service_role`
7. Regenerate Supabase TS types and confirm `Database['public']['Tables']['dd_task_status']` is present. (`task_status` enum continues to exist or remains absent — either way, no app code depends on it.)
8. Document in `.lovable/plan.md` under the enum-inventory section that `task_status` has been migrated to `dd_task_status` and the legacy enum is retained for rollback only.

### Migration SQL (ready to apply on approval)

File: `supabase/migrations/<timestamp>_add_dd_task_status.sql`

```sql
-- ============================================================
-- Migrate task_status enum -> dd_task_status lookup table
--
-- Additive only. Does not touch the legacy public.task_status
-- enum (retained for rollback). No existing columns altered.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.dd_task_status;
--   (Legacy enum remains intact.)
-- ============================================================

-- 1. Table (dd_accounting_system standard shape)
CREATE TABLE public.dd_task_status (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dd_task_status IS
  'Lookup table for task status. Replaces legacy public.task_status enum. '
  'Seeded byte-identical to the enum values; legacy enum retained for rollback.';

-- 2. Indexes for the common access patterns
CREATE INDEX dd_task_status_sort_order_idx ON public.dd_task_status (sort_order);
CREATE INDEX dd_task_status_is_active_idx  ON public.dd_task_status (is_active);

-- 3. Seed (byte-identical to enum values; labels are the rendered display strings)
INSERT INTO public.dd_task_status (value, label, sort_order, is_active) VALUES
  ('backlog',     'Backlog',     0, true),
  ('not_started', 'Not Started', 1, true),
  ('in_progress', 'In Progress', 2, true),
  ('blocked',     'Blocked',     3, true),
  ('completed',   'Completed',   4, true),
  ('cancelled',   'Cancelled',   5, true);

-- 4. Row-Level Security
ALTER TABLE public.dd_task_status ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user
CREATE POLICY "dd_task_status_select_authenticated"
  ON public.dd_task_status
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes: service_role only (PostgREST anon/authenticated cannot mutate)
CREATE POLICY "dd_task_status_insert_service_role"
  ON public.dd_task_status
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "dd_task_status_update_service_role"
  ON public.dd_task_status
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dd_task_status_delete_service_role"
  ON public.dd_task_status
  FOR DELETE
  TO service_role
  USING (true);

-- 5. Belt-and-braces grant lockdown (RLS already blocks, this removes
--    the table from anon/authenticated PostgREST surface entirely).
REVOKE ALL ON public.dd_task_status FROM PUBLIC;
GRANT SELECT ON public.dd_task_status TO authenticated;
GRANT ALL    ON public.dd_task_status TO service_role;

-- 6. In-transaction safety checks. Any failure rolls back the migration.
DO $$
DECLARE
  v_total       integer;
  v_distinct    integer;
  v_nulls       integer;
  v_orders      integer[];
  v_rls_enabled boolean;
BEGIN
  SELECT count(*) INTO v_total FROM public.dd_task_status;
  ASSERT v_total = 6, format('Expected 6 rows, found %s', v_total);

  SELECT count(DISTINCT value) INTO v_distinct
  FROM public.dd_task_status
  WHERE value IN ('backlog','not_started','in_progress','blocked','completed','cancelled');
  ASSERT v_distinct = 6, format('Expected 6 distinct seeded values, found %s', v_distinct);

  SELECT count(*) INTO v_nulls
  FROM public.dd_task_status
  WHERE value IS NULL OR label IS NULL OR sort_order IS NULL OR is_active IS NULL;
  ASSERT v_nulls = 0, format('Found %s null required-field values', v_nulls);

  SELECT array_agg(sort_order ORDER BY sort_order) INTO v_orders
  FROM public.dd_task_status;
  ASSERT v_orders = ARRAY[0,1,2,3,4,5],
    format('Sort order mismatch: %s', v_orders);

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE oid = 'public.dd_task_status'::regclass;
  ASSERT v_rls_enabled = true, 'RLS not enabled on dd_task_status';
END
$$;
```

### Sequence of work after plan approval

1. Apply the migration above (single transaction, includes assertions).
2. Run the post-deploy checklist (queries 1–6 listed above).
3. Confirm regenerated Supabase types include `dd_task_status`.
4. Append a one-line completion note to `.lovable/plan.md` enum-inventory.
5. No frontend / hook / UI changes required — `useTaskStatusOptions()` already reads from `dd_*` tables; once `dd_task_status` exists with the seeded labels, the existing pattern picks it up unchanged.