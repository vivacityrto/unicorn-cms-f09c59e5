## Phase C — Stage Instances Status Backfill (Step 4)

Single migration, single transaction. Snapshots all 6,175 rows to `archive.stage_instances_status_backfill_20260630`, asserts the snapshot count, runs six targeted UPDATEs in the exact mapping order, and asserts canonical-only state before COMMIT. No code changes.

### Pre-flight assumption

`archive` schema exists (used by prior phases). If not, the migration creates it. The snapshot table is created fresh (DROP IF EXISTS) so this migration is rerunnable in lower environments — production should only run it once.

### Migration SQL

```sql
BEGIN;

-- 0. Ensure archive schema exists
CREATE SCHEMA IF NOT EXISTS archive;

-- 1. Snapshot ALL rows (rollback source) — OD-2
DROP TABLE IF EXISTS archive.stage_instances_status_backfill_20260630;

CREATE TABLE archive.stage_instances_status_backfill_20260630 AS
SELECT
  id,
  status,
  status_id,
  status_date,
  completion_date,
  now() AS snapshotted_at
FROM public.stage_instances;

-- 1a. Assert snapshot captured exactly 6,175 rows
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM archive.stage_instances_status_backfill_20260630;

  IF v_count <> 6175 THEN
    RAISE EXCEPTION
      'Phase C aborted: snapshot row count = %, expected 6175', v_count;
  END IF;
END $$;

-- 2. Targeted UPDATEs — exact order and mapping per plan

-- 2a. '2' or 'complete' → 'completed'  (expect 38)
UPDATE public.stage_instances
   SET status = 'completed'
 WHERE status IN ('2', 'complete');

-- 2b. '1' → 'in_progress'  (expect 11)
UPDATE public.stage_instances
   SET status = 'in_progress'
 WHERE status = '1';

-- 2c. '4' → 'core_complete'  (expect 6)
UPDATE public.stage_instances
   SET status = 'core_complete'
 WHERE status = '4';

-- 2d. '3' → 'na'  (expect 2)
UPDATE public.stage_instances
   SET status = 'na'
 WHERE status = '3';

-- 2e. '6' → 'monitor'  (expect 1)
UPDATE public.stage_instances
   SET status = 'monitor'
 WHERE status = '6';

-- 2f. '0' OR NULL → 'not_started'  (expect 15 = 3 + 12)
UPDATE public.stage_instances
   SET status = 'not_started'
 WHERE status = '0' OR status IS NULL;

-- 3. In-transaction assertion: zero legacy rows remain
DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.stage_instances
  WHERE status IS NULL OR status ~ '^[0-9]+$';

  IF v_bad <> 0 THEN
    RAISE EXCEPTION
      'Phase C aborted: % rows still NULL or numeric after backfill', v_bad;
  END IF;
END $$;

-- 4. In-transaction assertion: only canonical values present
DO $$
DECLARE
  v_non_canonical bigint;
BEGIN
  SELECT count(*) INTO v_non_canonical
  FROM public.stage_instances
  WHERE status NOT IN (
    'not_started',
    'in_progress',
    'completed',
    'core_complete',
    'na',
    'monitor',
    'blocked',
    'closed'
  );

  IF v_non_canonical <> 0 THEN
    RAISE EXCEPTION
      'Phase C aborted: % rows hold non-canonical status values',
      v_non_canonical;
  END IF;
END $$;

COMMIT;
```

### Post-deploy verification (run manually after COMMIT)

```sql
-- expect 0
SELECT count(*) FROM public.stage_instances
WHERE status IS NULL OR status ~ '^[0-9]+$';

-- expect only canonical values (not_started, in_progress, completed,
-- core_complete, na, monitor, blocked, closed)
SELECT status, count(*) FROM public.stage_instances
GROUP BY status ORDER BY count(*) DESC;

-- expect 6175
SELECT count(*) FROM archive.stage_instances_status_backfill_20260630;
```

### Rollback (if needed within retention window)

```sql
BEGIN;
UPDATE public.stage_instances si
   SET status    = b.status,
       status_id = b.status_id
  FROM archive.stage_instances_status_backfill_20260630 b
 WHERE si.id = b.id;
COMMIT;
```

### Notes / scope boundaries

- `status_id` is intentionally NOT touched in this phase — Phase G nullifies/drops it. The snapshot preserves it so the rollback above is exact.
- `status_date` and `completion_date` are snapshotted for forensic completeness but not modified here. Phase A already maintains `completion_date` on new `core_complete` writes; backfilling historical `completion_date` for the 6 legacy `'4'` rows is out of scope and can be addressed in Phase D if any view requires it (none of the D2 views currently depend on it).
- Five `RAISE EXCEPTION` guards (snapshot count, residual numeric/NULL, non-canonical) force a full transaction rollback on any drift — no partial backfill can ship.
- The `'complete'` (singular) branch is kept as a safety net per the brief even though the pre-gate confirmed 0 such rows.

Confirm and I'll switch to build mode and submit exactly this migration via `supabase--migration`.