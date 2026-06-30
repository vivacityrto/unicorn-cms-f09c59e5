# Phase F + G — Stage Status: CHECK constraint + status_id / dd_stage_state deprecation

Single migration. Ships Phase F (CHECK constraint, NOT VALID then VALIDATE) and Phase G (drop index, null status_id, archive `dd_stage_state`, drop `status_id` column, PostgREST reload) as one transactional release.

## Live state verified (pre-flight)

| Check | Value | Required |
|---|---|---|
| Non-canonical `stage_instances.status` rows | **0** | 0 ✅ |
| Rows with `status_id IS NOT NULL` | **6,175** | will be nulled in step G2 |
| `idx_stage_instances_status_id` present | **yes** | will be dropped |
| `stage_instances.status_id` column present | **yes** | will be dropped |
| `public.dd_stage_state` present | **yes** | will be archived |
| FKs `stage_instances.status_id → dd_stage_state` | **0** | safe |
| Non-internal dependents on `dd_stage_state` | **0** | safe |
| Functions/views referencing `stage_instances.status_id` | **0** | safe — only `staff_task_instances.status_id` (out of scope D4) and `publish_stage_version` / `start_client_package` / `repair_package_instance_stages` writes to **child** tables remain, untouched |
| `trg_update_event_conducted_date` trigger | bound to `staff_task_instances.status_id` (D4 scope) — not affected |

## Decisions to confirm

- **OD-F1**: Run `ADD CONSTRAINT … NOT VALID` and `VALIDATE CONSTRAINT` in the **same** migration transaction. Pre-flight already proved 0 violators, so VALIDATE is expected to be clean and the in-transaction validate is acceptable.
- **OD-G1**: `dd_stage_state` is archived via `SET SCHEMA archive` (not dropped). Reversible by `SET SCHEMA public`.
- **OD-G2**: `status_id` column is dropped immediately — no off-peak wait (per your OD-4 update). The snapshot from Phase C (`archive.stage_instances_status_backfill_20260630`) already preserves `id, status_id` for all 6,175 rows, so restoration is possible without a fresh `pg_dump`. The plan still includes a `SELECT id, status_id FROM public.stage_instances LIMIT 0` sanity assert before the DROP to confirm the column exists at that point.

## Proposed migration SQL

```sql
BEGIN;

-- =========================================================
-- Phase F — CHECK constraint
-- =========================================================

-- Defensive pre-flight inside the transaction
DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.stage_instances
  WHERE status NOT IN (
    'not_started','in_progress','completed','core_complete',
    'na','blocked','monitor','closed'
  );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Phase F aborted: % non-canonical status rows present', v_bad;
  END IF;
END $$;

ALTER TABLE public.stage_instances
  ADD CONSTRAINT chk_stage_instances_status_valid
  CHECK (status IN (
    'not_started','in_progress','completed','core_complete',
    'na','blocked','monitor','closed'
  ))
  NOT VALID;

ALTER TABLE public.stage_instances
  VALIDATE CONSTRAINT chk_stage_instances_status_valid;

-- =========================================================
-- Phase G — Deprecate status_id and dd_stage_state
-- =========================================================

-- G1. Drop the now-unused index on status_id
DROP INDEX IF EXISTS public.idx_stage_instances_status_id;

-- G2. Null out status_id values (snapshot already preserved in
-- archive.stage_instances_status_backfill_20260630 from Phase C)
UPDATE public.stage_instances
   SET status_id = NULL
 WHERE status_id IS NOT NULL;

-- G3. Archive dd_stage_state (pre-check: no non-internal dependents)
DO $$
DECLARE v_dep bigint;
BEGIN
  SELECT count(*) INTO v_dep
  FROM pg_depend d
  JOIN pg_class c ON c.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'dd_stage_state'
    AND n.nspname = 'public'
    AND d.deptype NOT IN ('i','a');
  IF v_dep <> 0 THEN
    RAISE EXCEPTION 'Phase G aborted: % external dependents on dd_stage_state', v_dep;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS archive;
ALTER TABLE public.dd_stage_state SET SCHEMA archive;

-- G4. Drop the status_id column (sanity-assert column exists first)
DO $$
BEGIN
  PERFORM 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'stage_instances'
    AND column_name  = 'status_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phase G aborted: stage_instances.status_id column missing before DROP';
  END IF;
END $$;

ALTER TABLE public.stage_instances DROP COLUMN status_id;

-- G5. Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
```

## Post-deploy verification

```sql
-- F: constraint present and valid
SELECT conname, convalidated
  FROM pg_constraint
 WHERE conrelid = 'public.stage_instances'::regclass
   AND conname = 'chk_stage_instances_status_valid';
-- expect 1 row, convalidated = true

-- F: rejects a bad value (run in scratch)
-- INSERT INTO public.stage_instances (status) VALUES ('bogus');  -- expect 23514

-- G: status_id column gone
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='stage_instances' AND column_name='status_id';
-- expect 0

-- G: index gone
SELECT count(*) FROM pg_indexes
 WHERE schemaname='public' AND indexname='idx_stage_instances_status_id';
-- expect 0

-- G: dd_stage_state moved
SELECT table_schema FROM information_schema.tables WHERE table_name='dd_stage_state';
-- expect 'archive'
```

## Rollback

```sql
-- Phase F rollback
ALTER TABLE public.stage_instances
  DROP CONSTRAINT chk_stage_instances_status_valid;

-- Phase G rollback
-- (a) restore dd_stage_state
ALTER TABLE archive.dd_stage_state SET SCHEMA public;

-- (b) restore status_id column from Phase C snapshot
ALTER TABLE public.stage_instances ADD COLUMN status_id integer;
UPDATE public.stage_instances si
   SET status_id = b.status_id
  FROM archive.stage_instances_status_backfill_20260630 b
 WHERE si.id = b.id;
CREATE INDEX idx_stage_instances_status_id
  ON public.stage_instances(status_id);

SELECT pg_notify('pgrst', 'reload schema');
```

## Notes / scope boundaries

- `staff_task_instances.status_id` and `client_task_instances.status_id` are **out of scope** (D4). Functions `publish_stage_version`, `start_client_package`, `repair_package_instance_stages` and trigger `trg_update_event_conducted_date` all touch those child tables and remain untouched.
- The Phase C snapshot is the rollback source of truth for `status_id` — no fresh `pg_dump` is required.
- VALIDATE runs inside the same transaction as ADD CONSTRAINT because the pre-flight already confirmed 0 violators across all 6,175 rows. If the project later prefers a two-step deploy (NOT VALID now, VALIDATE off-peak), say so and I'll split it.

Confirm OD-F1, OD-G1, OD-G2 and I'll switch to build mode and ship exactly this migration via `supabase--migration`.
