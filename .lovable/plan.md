# Phase 2a — Additive columns on `compliance_obligations`

Scope: one migration. Purely additive. No view/function/trigger/RLS changes. No backfill (Phase 2b).

## Migration SQL

```sql
ALTER TABLE public.compliance_obligations
  ADD COLUMN lead_times           integer[] NOT NULL DEFAULT ARRAY[30,14,7,1],
  ADD COLUMN notification_message text,
  ADD COLUMN due_date             date,
  ADD COLUMN audience_id          integer REFERENCES public.dd_obligation_audience(id),
  ADD COLUMN recurrence_id        integer REFERENCES public.dd_obligation_recurrence(id);
```

Rationale:
- `lead_times` — constant array default ⇒ Postgres 11+ metadata-only, no rewrite.
- `audience_id` / `recurrence_id` — nullable FKs to the Phase 1 `dd_*` tables. Stay NULL until Phase 2b backfill. No `NOT NULL` yet.
- `notification_message`, `due_date` — nullable, no default.
- No `GRANT` changes needed (table already exists with grants intact).
- View `v_client_reporting_reminders` is unaffected — it does not select these new columns; PostgREST/consumers ignore unknown additive columns.

## Verification (post-migration)

```sql
-- Columns present, audience_id/recurrence_id nullable
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'compliance_obligations'
ORDER BY ordinal_position;

-- View row count unchanged
SELECT count(*) FROM public.v_client_reporting_reminders;  -- expect 2247

-- FK wiring correct
SELECT conname, confrelid::regclass
FROM pg_constraint
WHERE conrelid = 'public.compliance_obligations'::regclass
  AND contype = 'f'
  AND conname LIKE '%audience%' OR conname LIKE '%recurrence%';

-- Default array materialised on existing rows
SELECT count(*) FILTER (WHERE lead_times = ARRAY[30,14,7,1]) AS defaulted,
       count(*) AS total
FROM public.compliance_obligations;
```

## Risk assessment

- **Rewrite risk:** None. Constant-default fast path for `lead_times`; other adds are nullable.
- **Consumer breakage:** None. View definition unchanged; select-list of `v_client_reporting_reminders` does not reference new columns. Frontend `types.ts` will regenerate post-approval; no code reads the new columns yet.
- **RLS:** Unchanged. Existing 2 policies on `compliance_obligations` continue to apply to new columns.
- **FK risk:** Nullable FKs against fully-seeded `dd_*` tables — no insert can fail until Phase 2b assigns values.
- **Lock:** Brief `ACCESS EXCLUSIVE` on `compliance_obligations` for metadata update only.

## Rollback

```sql
ALTER TABLE public.compliance_obligations
  DROP COLUMN lead_times,
  DROP COLUMN notification_message,
  DROP COLUMN due_date,
  DROP COLUMN audience_id,
  DROP COLUMN recurrence_id;
```

Safe — no other object depends on these columns yet.

## Out of scope (Phase 2b and beyond)

- Backfilling `audience_id` / `recurrence_id` from legacy `audience` / `recurrence` text columns.
- Setting `NOT NULL` on the new FK columns.
- Updating `v_client_reporting_reminders` internals.
- Edge function, cron, frontend CRUD.
