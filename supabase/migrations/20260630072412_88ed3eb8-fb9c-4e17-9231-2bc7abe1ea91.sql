CREATE SCHEMA IF NOT EXISTS archive;

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

UPDATE public.stage_instances
   SET status = 'completed'
 WHERE status IN ('2', 'complete');

UPDATE public.stage_instances
   SET status = 'in_progress'
 WHERE status = '1';

UPDATE public.stage_instances
   SET status = 'core_complete'
 WHERE status = '4';

UPDATE public.stage_instances
   SET status = 'na'
 WHERE status = '3';

UPDATE public.stage_instances
   SET status = 'monitor'
 WHERE status = '6';

UPDATE public.stage_instances
   SET status = 'not_started'
 WHERE status = '0' OR status IS NULL;

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