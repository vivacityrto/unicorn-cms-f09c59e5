-- Phase 3D: notification_integration_status enum -> dd_notification_integration_status lookup
-- Final enum in the notification-family conversion chain. Mirrors Phase 3A/3B/3C precedent.

-- 1. CREATE LOOKUP TABLE
CREATE TABLE public.dd_notification_integration_status (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. SEED (byte-identical to legacy enum labels)
INSERT INTO public.dd_notification_integration_status (value, label, sort_order) VALUES
  ('connected',    'Connected',    1),
  ('disconnected', 'Disconnected', 2),
  ('error',        'Error',        3);

-- 3. RLS — public read, service-role write only
ALTER TABLE public.dd_notification_integration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_notification_integration_status_select"
  ON public.dd_notification_integration_status
  FOR SELECT
  USING (true);

-- 7a. SAFETY: snapshot row count + pre-flight value coverage check
DO $$
DECLARE
  v_row_count_before bigint;
  v_missing_count    bigint;
BEGIN
  SELECT count(*) INTO v_row_count_before
    FROM public.user_notification_integrations;

  PERFORM set_config('phase3d.row_count_before', v_row_count_before::text, false);

  SELECT count(*) INTO v_missing_count
    FROM public.user_notification_integrations uni
   WHERE uni.status::text NOT IN (
     SELECT value FROM public.dd_notification_integration_status
   );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Phase 3D pre-flight failed: % rows have status values not present in dd_notification_integration_status', v_missing_count;
  END IF;
END $$;

-- 4. ALTER COLUMN: enum -> text (preserve NOT NULL, restate default)
ALTER TABLE public.user_notification_integrations
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.user_notification_integrations
  ALTER COLUMN status TYPE text
  USING status::text;

ALTER TABLE public.user_notification_integrations
  ALTER COLUMN status SET DEFAULT 'disconnected';

-- 5. FOREIGN KEY -> dd_notification_integration_status(value)
ALTER TABLE public.user_notification_integrations
  ADD CONSTRAINT user_notification_integrations_status_fkey
  FOREIGN KEY (status)
  REFERENCES public.dd_notification_integration_status(value)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

-- 6. RETAIN legacy enum with retention comment
COMMENT ON TYPE public.notification_integration_status IS
  'Retained for rollback safety. Final notification-family enum in the conversion chain. Eligible for archival cleanup once Phase 3D verified in production.';

-- 7b. POST-MIGRATION: assert row count parity + no invalid values
DO $$
DECLARE
  v_row_count_before bigint;
  v_row_count_after  bigint;
  v_invalid_count    bigint;
BEGIN
  v_row_count_before := current_setting('phase3d.row_count_before')::bigint;

  SELECT count(*) INTO v_row_count_after
    FROM public.user_notification_integrations;

  IF v_row_count_after <> v_row_count_before THEN
    RAISE EXCEPTION 'Phase 3D post-check failed: row count drift (before=%, after=%)',
      v_row_count_before, v_row_count_after;
  END IF;

  SELECT count(*) INTO v_invalid_count
    FROM public.user_notification_integrations uni
   WHERE uni.status NOT IN (
     SELECT value FROM public.dd_notification_integration_status
   );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Phase 3D post-check failed: % rows have invalid status values', v_invalid_count;
  END IF;
END $$;

-- ROLLBACK:
-- ALTER TABLE public.user_notification_integrations
--   DROP CONSTRAINT user_notification_integrations_status_fkey;
-- ALTER TABLE public.user_notification_integrations
--   ALTER COLUMN status DROP DEFAULT,
--   ALTER COLUMN status TYPE public.notification_integration_status
--     USING status::public.notification_integration_status,
--   ALTER COLUMN status SET DEFAULT
--     'disconnected'::public.notification_integration_status;
-- DROP TABLE public.dd_notification_integration_status;