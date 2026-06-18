# Phase 2b — Backfill `audience_id` and `recurrence_id`

Scope: data-only backfill on `public.compliance_obligations`. No schema changes. No `NOT NULL` (that's Phase 2c). Uses the `supabase--insert` tool (UPDATE statements, not a migration).

## SQL

```sql
UPDATE public.compliance_obligations c
   SET audience_id = a.id
  FROM public.dd_obligation_audience a
 WHERE a.value = c.audience;

UPDATE public.compliance_obligations c
   SET recurrence_id = r.id
  FROM public.dd_obligation_recurrence r
 WHERE r.value = c.recurrence;
```

## Pre-check (already confirmed in Phase 1 audit)

All distinct `audience` and `recurrence` text values on `compliance_obligations` are covered by the seeded `dd_*` lookup rows, so every row will match.

## Verification — hard gate

```sql
SELECT count(*) AS null_audience_id
FROM public.compliance_obligations
WHERE audience_id IS NULL;          -- must be 0

SELECT count(*) AS null_recurrence_id
FROM public.compliance_obligations
WHERE recurrence_id IS NULL;        -- must be 0

SELECT count(*) FROM public.v_client_reporting_reminders;  -- must be 2247
```

If any null count is non-zero, stop — do not proceed to Phase 2c. Investigate the unmatched legacy text value and extend the `dd_*` table before retrying.

## Risk assessment

- **Data risk:** None — overwrites only NULLs, joined on equality against the canonical lookup.
- **Concurrency:** Brief row-level locks on `compliance_obligations` during update. No DDL, no view rebuild.
- **View impact:** `v_client_reporting_reminders` does not reference the new columns; count must stay at 2247.
- **RLS:** Unchanged.

## Rollback

```sql
UPDATE public.compliance_obligations
   SET audience_id = NULL,
       recurrence_id = NULL;
```

Safe — no FK constraint requires these columns to be populated yet.

## Out of scope

- Setting `NOT NULL` on `audience_id` / `recurrence_id` (Phase 2c).
- Dropping the legacy `audience` / `recurrence` text columns (later phase).
- View, edge function, cron, frontend changes.
