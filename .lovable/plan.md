## Fix Ambiguous Column Reference in `lease_cohort_job_items`

### Problem
`lease_cohort_job_items` returns a table with an `id` column, creating a PL/pgSQL output variable named `id`. Inside the function body, the `EXISTS` check uses unqualified `id`:

```sql
WHERE id = p_job_id AND status = 'running'
```

PostgreSQL resolves this to the output variable (always NULL), so the condition is never true and the function returns zero rows every time, stalling the entire cohort-access-sender-worker.

### Fix
Qualify the column reference with a table alias in the `EXISTS` check.

**BEFORE:**
```sql
IF NOT EXISTS (
  SELECT 1 FROM public.cohort_send_jobs
  WHERE id = p_job_id AND status = 'running'
) THEN
```

**AFTER:**
```sql
IF NOT EXISTS (
  SELECT 1 FROM public.cohort_send_jobs csj
  WHERE csj.id = p_job_id AND csj.status = 'running'
) THEN
```

### Scope
- Single migration: `CREATE OR REPLACE FUNCTION public.lease_cohort_job_items(...)` with only the alias change shown above.
- All other function logic, signature, `SECURITY DEFINER`, and `SET search_path` remain unchanged.
- No other files or functions are modified.

### Acceptance
- The worker should begin leasing and processing pending cohort job items instead of returning zero rows on every call.