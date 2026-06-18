## Phase 2e — Drop legacy `audience` / `recurrence` text columns

### Goal
Remove the now-unused `audience` and `recurrence` text columns (and any associated CHECK constraints) from `public.compliance_obligations`. The view and all consumers have moved to the FK columns; no app code references these text columns.

### Migration
```sql
ALTER TABLE public.compliance_obligations
  DROP CONSTRAINT IF EXISTS compliance_obligations_audience_check,
  DROP CONSTRAINT IF EXISTS compliance_obligations_recurrence_check,
  DROP COLUMN audience,
  DROP COLUMN recurrence;
```

### Verification (hard gate)
1. `information_schema.columns` for `compliance_obligations` filtered to `audience`/`recurrence` → **0 rows**.
2. `SELECT count(*) FROM public.v_client_reporting_reminders` → **2247**.
3. View column list still returns the 14 columns in the same order, with `audience text` and `recurrence text` present (now sourced from `dd_*` lookups).

If any check fails, roll back immediately.

### Rollback (only if needed before Phase 3+)
1. Re-add nullable text columns:
   ```sql
   ALTER TABLE public.compliance_obligations
     ADD COLUMN audience text,
     ADD COLUMN recurrence text;
   ```
2. Repopulate from FK lookups:
   ```sql
   UPDATE public.compliance_obligations c
      SET audience   = a.value
     FROM public.dd_obligation_audience a
    WHERE a.id = c.audience_id;
   UPDATE public.compliance_obligations c
      SET recurrence = r.value
     FROM public.dd_obligation_recurrence r
    WHERE r.id = c.recurrence_id;
   ```
3. Restore the prior view body from the Phase 2d snapshot.

### Out of scope
Phase 3 and beyond. No frontend, RLS, function, or trigger changes.
