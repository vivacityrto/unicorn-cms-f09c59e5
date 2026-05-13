BEGIN;

-- Step 1: Precondition guards
DO $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'sch_booking_status' AND t.typtype = 'e'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: enum public.sch_booking_status not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dd_sch_booking_status'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: public.dd_sch_booking_status already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sch_bookings'
      AND column_name='status' AND udt_name='sch_booking_status'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: sch_bookings.status is not sch_booking_status enum';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sch_bookings
  WHERE status::text NOT IN ('pending','confirmed','rescheduled','cancelled');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Precondition failed: % row(s) with non-canonical status', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.sch_bookings'::regclass
      AND tgname='trg_sch_bookings_audit' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Precondition failed: trigger trg_sch_bookings_audit missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.sch_bookings'::regclass
      AND tgname='trg_sch_bookings_updated_at' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Precondition failed: trigger trg_sch_bookings_updated_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='sch_log_booking_change'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: function public.sch_log_booking_change not found';
  END IF;
END $$;

-- Step 2: Create dd_sch_booking_status lookup
CREATE TABLE public.dd_sch_booking_status (
  id          serial PRIMARY KEY,
  value       text   NOT NULL UNIQUE,
  label       text   NOT NULL,
  sort_order  int    NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dd_sch_booking_status IS
  'Lookup for sch_bookings.status. Replaces legacy enum public.sch_booking_status (Phase 2B).';

-- Step 2a: RLS + read policy
ALTER TABLE public.dd_sch_booking_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_sch_booking_status_read_authenticated"
  ON public.dd_sch_booking_status
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 3: Seed canonical values
INSERT INTO public.dd_sch_booking_status (value, label, sort_order) VALUES
  ('pending',      'Pending',      10),
  ('confirmed',    'Confirmed',    20),
  ('rescheduled',  'Rescheduled',  30),
  ('cancelled',    'Cancelled',    40);

-- Step 4: Drop enum-typed default
ALTER TABLE public.sch_bookings ALTER COLUMN status DROP DEFAULT;

-- Step 5: Convert column to text
ALTER TABLE public.sch_bookings
  ALTER COLUMN status TYPE text USING status::text;

-- Step 6: Restore default as plain text
ALTER TABLE public.sch_bookings ALTER COLUMN status SET DEFAULT 'confirmed';

-- Step 7: FK with CASCADE / RESTRICT
ALTER TABLE public.sch_bookings
  ADD CONSTRAINT sch_bookings_status_fkey
  FOREIGN KEY (status)
  REFERENCES public.dd_sch_booking_status(value)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.sch_bookings VALIDATE CONSTRAINT sch_bookings_status_fkey;

-- Step 8: Replan sch_log_booking_change() (body byte-identical to live)
CREATE OR REPLACE FUNCTION public.sch_log_booking_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid;
  act text;
  det jsonb;
BEGIN
  BEGIN
    actor := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN others THEN
    actor := auth.uid();
  END;

  IF (TG_OP = 'INSERT') THEN
    act := 'booking.created';
    det := jsonb_build_object(
      'starts_at', NEW.starts_at,
      'ends_at', NEW.ends_at,
      'status', NEW.status
    );
    INSERT INTO public.sch_audit_log(org_id, actor_id, action, entity, entity_id, details)
    VALUES (NEW.org_id, COALESCE(actor, NEW.created_by), act, 'sch_bookings', NEW.id, det);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status <> NEW.status) THEN
      act := CASE NEW.status
        WHEN 'cancelled' THEN 'booking.cancelled'
        WHEN 'rescheduled' THEN 'booking.rescheduled'
        ELSE 'booking.updated'
      END;
    ELSE
      act := 'booking.updated';
    END IF;
    det := jsonb_build_object(
      'old_starts_at', OLD.starts_at,
      'old_ends_at', OLD.ends_at,
      'new_starts_at', NEW.starts_at,
      'new_ends_at', NEW.ends_at,
      'old_status', OLD.status,
      'new_status', NEW.status
    );
    INSERT INTO public.sch_audit_log(org_id, actor_id, action, entity, entity_id, details)
    VALUES (NEW.org_id, COALESCE(actor, NEW.created_by), act, 'sch_bookings', NEW.id, det);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 9: Document legacy enum retention
COMMENT ON TYPE public.sch_booking_status IS
  'LEGACY: retained for Phase 2B rollback safety. sch_bookings.status migrated to text + FK to public.dd_sch_booking_status (Phase 2B). Drop in Phase 2C after stability window.';

COMMIT;