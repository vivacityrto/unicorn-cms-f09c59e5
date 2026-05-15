-- Phase 3C: notification_delivery_target enum -> dd_notification_delivery_target lookup
-- Follows Phase 3A / 3B precedent. Legacy enum retained for rollback.

-- Snapshot pre-migration row count for safety check
DO $$
DECLARE
  v_before bigint;
BEGIN
  SELECT count(*) INTO v_before FROM public.notification_rules;
  PERFORM set_config('phase3c.notification_rules_before', v_before::text, true);
END $$;

-- 1. Lookup table (matches dd_accounting_system shape)
CREATE TABLE public.dd_notification_delivery_target (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed (byte-identical to current enum labels)
INSERT INTO public.dd_notification_delivery_target (value, label, sort_order) VALUES
  ('dm',      'Direct Message', 1),
  ('channel', 'Channel',        2);

-- 3. RLS: public read, writes restricted to service role (no policies for write)
ALTER TABLE public.dd_notification_delivery_target ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_notification_delivery_target_select"
  ON public.dd_notification_delivery_target
  FOR SELECT
  USING (true);

-- 7a. Pre-flight: every existing delivery_target value must exist in the lookup
DO $$
DECLARE
  v_invalid bigint;
BEGIN
  SELECT count(*) INTO v_invalid
  FROM public.notification_rules nr
  WHERE nr.delivery_target::text NOT IN (
    SELECT value FROM public.dd_notification_delivery_target
  );
  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'Phase 3C aborted: % notification_rules row(s) have delivery_target values not present in dd_notification_delivery_target', v_invalid;
  END IF;
END $$;

-- 4. Swap column type enum -> text, preserve NOT NULL, restore default
ALTER TABLE public.notification_rules
  ALTER COLUMN delivery_target DROP DEFAULT;

ALTER TABLE public.notification_rules
  ALTER COLUMN delivery_target TYPE text USING delivery_target::text;

ALTER TABLE public.notification_rules
  ALTER COLUMN delivery_target SET DEFAULT 'dm';

-- 5. Foreign key to lookup
ALTER TABLE public.notification_rules
  ADD CONSTRAINT notification_rules_delivery_target_fkey
  FOREIGN KEY (delivery_target)
  REFERENCES public.dd_notification_delivery_target(value)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

-- 6. Retain legacy enum with retention comment
COMMENT ON TYPE public.notification_delivery_target IS
  'Retained for rollback safety. Do not drop until Phase 3D (notification_integration_status) is complete and verified.';

-- 7b. Post-migration: row count parity + value validity
DO $$
DECLARE
  v_before bigint;
  v_after  bigint;
  v_invalid bigint;
BEGIN
  v_before := current_setting('phase3c.notification_rules_before', true)::bigint;
  SELECT count(*) INTO v_after FROM public.notification_rules;
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'Phase 3C aborted: notification_rules row count changed (% -> %)', v_before, v_after;
  END IF;

  SELECT count(*) INTO v_invalid
  FROM public.notification_rules nr
  WHERE nr.delivery_target NOT IN (
    SELECT value FROM public.dd_notification_delivery_target
  );
  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'Phase 3C aborted: % notification_rules row(s) have invalid delivery_target after swap', v_invalid;
  END IF;
END $$;

-- ROLLBACK:
-- ALTER TABLE public.notification_rules
--   DROP CONSTRAINT notification_rules_delivery_target_fkey;
-- ALTER TABLE public.notification_rules
--   ALTER COLUMN delivery_target DROP DEFAULT,
--   ALTER COLUMN delivery_target TYPE public.notification_delivery_target
--     USING delivery_target::public.notification_delivery_target,
--   ALTER COLUMN delivery_target SET DEFAULT 'dm'::public.notification_delivery_target;
-- DROP TABLE public.dd_notification_delivery_target;
