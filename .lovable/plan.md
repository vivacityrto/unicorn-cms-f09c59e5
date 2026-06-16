Fix PL/pgSQL variable-name collision in `rpc_publish_stage_tasks`

The existing migration declares `cti record;` in the DECLARE block, then uses `FOR cti IN ...` with a query that also aliases the table as `cti`. Postgres substitutes the uninitialized PL/pgSQL variable instead of the SQL alias, causing "record 'cti' is not assigned yet".

Changes to `supabase/migrations/20260616031522_61eff5d5-9d75-4ca3-83b3-66341f0ab89b.sql`:

1. Remove line 18 (`cti record;`) from the DECLARE block. PL/pgSQL FOR loop variables do not need to be pre-declared.
2. Rename the FOR loop variable from `cti` to `r` (line 43: `FOR r IN`).
3. Update every loop-body field reference to use `r.` instead of `cti.`:
   - Line 73: `cti.name` → `r.name`
   - Line 74: `cti.description` → `r.description`
   - Line 75: `cti.due_date` → `r.due_date`
   - Line 84: `cti.sort_order` → `r.sort_order`
   - Line 81: `cti.id::text` → `r.id::text`
   - Line 91: `cti.id` → `r.id`
4. Leave the SQL query alias `cti` inside the SELECT/JOIN/WHERE and `FOR UPDATE` untouched.

No changes to grants, comments, audit logic, or any other file.