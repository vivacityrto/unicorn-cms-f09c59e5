## Drop Old Cohort Function Overloads

### Problem
The previous migration added `p_caller_id uuid DEFAULT NULL` to four cohort send job functions, but `CREATE OR REPLACE FUNCTION` does not remove old overloaded signatures. PostgreSQL now has ambiguous function references when callers omit the new parameter.

### Solution
Create a migration that drops the old (shorter) signatures, leaving only the new versions intact.

### SQL
```sql
DROP FUNCTION IF EXISTS public.set_cohort_job_status(uuid, text);
DROP FUNCTION IF EXISTS public.lease_cohort_job_items(uuid, text, integer);
DROP FUNCTION IF EXISTS public.record_cohort_item_outcome(bigint, text, text);
DROP FUNCTION IF EXISTS public.finalise_cohort_job(uuid);
```

### Scope
- Only these four DROP statements.
- No changes to the new function versions, no frontend or edge function edits.
