-- M3-C: retire the empty, fully orphaned legacy notification schedule table.
--
-- This migration is intentionally fail-closed: it refuses to drop the table
-- if rows, external foreign keys, runtime function/view references, triggers,
-- or cron references reappear before deployment. The table is empty and has
-- no dependants in the reviewed production state.

DO $$
DECLARE
  row_count bigint;
  dependency_count bigint;
BEGIN
  IF to_regclass('public.notification_schedule') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.notification_schedule' INTO row_count;
  IF row_count <> 0 THEN
    RAISE EXCEPTION
      'M3-C refused: public.notification_schedule contains % rows', row_count;
  END IF;

  SELECT count(*) INTO dependency_count
  FROM pg_constraint
  WHERE confrelid = 'public.notification_schedule'::regclass;
  IF dependency_count <> 0 THEN
    RAISE EXCEPTION
      'M3-C refused: % foreign keys reference public.notification_schedule',
      dependency_count;
  END IF;

  SELECT count(*) INTO dependency_count
  FROM pg_trigger
  WHERE tgrelid = 'public.notification_schedule'::regclass
    AND NOT tgisinternal;
  IF dependency_count <> 0 THEN
    RAISE EXCEPTION
      'M3-C refused: public.notification_schedule has % user triggers',
      dependency_count;
  END IF;

  SELECT count(*) INTO dependency_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_get_functiondef(p.oid) ILIKE '%notification_schedule%';
  IF dependency_count <> 0 THEN
    RAISE EXCEPTION
      'M3-C refused: % public functions reference notification_schedule',
      dependency_count;
  END IF;

  SELECT count(*) INTO dependency_count
  FROM pg_views v
  WHERE v.schemaname = 'public'
    AND pg_get_viewdef(
      (quote_ident(v.schemaname) || '.' || quote_ident(v.viewname))::regclass,
      true
    ) ILIKE '%notification_schedule%';
  IF dependency_count <> 0 THEN
    RAISE EXCEPTION
      'M3-C refused: % public views reference notification_schedule',
      dependency_count;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $cron$
      SELECT count(*)
      FROM cron.job
      WHERE command ILIKE '%notification_schedule%'
         OR command ILIKE '%process-notification-queue%'
    $cron$ INTO dependency_count;
    IF dependency_count <> 0 THEN
      RAISE EXCEPTION
        'M3-C refused: % cron jobs reference the retired notification path',
        dependency_count;
    END IF;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.notification_schedule;

DO $$
BEGIN
  IF to_regclass('public.notification_schedule') IS NOT NULL THEN
    RAISE EXCEPTION 'M3-C postflight failed: notification_schedule still exists';
  END IF;
  IF to_regclass('public.notification_audit_log') IS NULL THEN
    RAISE EXCEPTION 'M3-C postflight failed: notification_audit_log changed or is absent';
  END IF;
  IF to_regclass('public.notification_outbox') IS NULL THEN
    RAISE EXCEPTION 'M3-C postflight failed: notification_outbox changed or is absent';
  END IF;
END
$$;
