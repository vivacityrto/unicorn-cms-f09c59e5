-- Phase 5D: Migrate eos_participant_role enum to dd_eos_participant_role lookup table
-- Single atomic migration. Legacy enum retained for rollback.

-- =========================================================================
-- Step 1 — Pre-flight safety checks
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.eos_meeting_participants
    WHERE role IS NOT NULL
      AND role::text NOT IN ('Leader', 'Member', 'Observer')
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: unexpected values in eos_meeting_participants.role';
  END IF;

  IF (SELECT COUNT(*) FROM public.eos_meeting_participants) != 162 THEN
    RAISE WARNING 'Row count differs from baseline of 162 — verify before proceeding';
  END IF;
END $$;

-- =========================================================================
-- Step 2 — Create dd_eos_participant_role
-- =========================================================================
CREATE TABLE public.dd_eos_participant_role (
  id          serial PRIMARY KEY,
  value       text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_eos_participant_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_eos_participant_role"
  ON public.dd_eos_participant_role
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================================
-- Step 3 — Seed values (byte-identical to enum labels)
-- =========================================================================
INSERT INTO public.dd_eos_participant_role (value, label, sort_order) VALUES
  ('Leader',   'Leader',   1),
  ('Member',   'Member',   2),
  ('Observer', 'Observer', 3);

-- =========================================================================
-- Step 4 — Change column type and default
-- =========================================================================
ALTER TABLE public.eos_meeting_participants
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE public.eos_meeting_participants
  ALTER COLUMN role TYPE text USING role::text;

ALTER TABLE public.eos_meeting_participants
  ALTER COLUMN role SET DEFAULT 'Member'::text;

-- =========================================================================
-- Step 5 — Add FK constraint
-- =========================================================================
ALTER TABLE public.eos_meeting_participants
  ADD CONSTRAINT fk_eos_meeting_participants_role
  FOREIGN KEY (role)
  REFERENCES public.dd_eos_participant_role(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- =========================================================================
-- Step 6 — Recreate create_meeting_basic (integer overload)
-- Only change: 'Leader'::public.eos_participant_role → 'Leader'
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_meeting_basic(
  p_tenant_id integer,
  p_title text,
  p_meeting_type text,
  p_scheduled_date timestamp with time zone,
  p_duration_minutes integer,
  p_facilitator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id uuid;
BEGIN
  -- Create the meeting (using created_by, NOT facilitator_id which doesn't exist)
  INSERT INTO public.eos_meetings (
    tenant_id,
    title,
    meeting_type,
    scheduled_date,
    duration_minutes,
    created_by,
    is_complete
  ) VALUES (
    p_tenant_id,
    p_title,
    p_meeting_type::public.eos_meeting_type,
    p_scheduled_date,
    p_duration_minutes,
    p_facilitator_id,
    false
  )
  RETURNING id INTO v_meeting_id;

  -- Add facilitator as a participant with Leader role
  INSERT INTO public.eos_meeting_participants (
    meeting_id,
    user_id,
    role,
    attended
  ) VALUES (
    v_meeting_id,
    p_facilitator_id,
    'Leader',
    false
  );

  RETURN v_meeting_id;
END;
$function$;

-- =========================================================================
-- Step 7 — Recreate create_meeting_from_template (bigint overload)
-- Only change: remove ::eos_participant_role casts on 'Leader' and 'Member'
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id bigint,
  p_agenda_template_id uuid,
  p_title text,
  p_scheduled_date timestamp with time zone,
  p_duration_minutes integer,
  p_facilitator_id uuid,
  p_scribe_id uuid DEFAULT NULL::uuid,
  p_participant_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id UUID;
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_is_level10 BOOLEAN := false;
  v_participant_count INT := 0;
  v_seg_name TEXT;
  v_seg_duration INT;
BEGIN
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  v_is_level10 := (v_template.meeting_type::text ILIKE '%L10%' OR v_template.meeting_type::text ILIKE '%level%10%');
  
  INSERT INTO public.eos_meetings (
    tenant_id, meeting_type, title, scheduled_date, duration_minutes,
    template_id, template_version_id, created_by
  ) VALUES (
    p_tenant_id, v_template.meeting_type, p_title, p_scheduled_date,
    p_duration_minutes, p_agenda_template_id, v_template.current_version_id, auth.uid()
  ) RETURNING id INTO v_meeting_id;
  
  -- Create meeting segments - handle both JSON key formats
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
    v_seg_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT,
      (v_segment->>'duration')::INT,
      5
    );
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      v_meeting_id, v_seg_name, v_seg_duration, v_sequence
    );
    
    v_total_duration := v_total_duration + v_seg_duration;
    v_sequence := v_sequence + 1;
  END LOOP;
  
  IF v_total_duration != p_duration_minutes THEN
    UPDATE public.eos_meetings SET duration_minutes = v_total_duration WHERE id = v_meeting_id;
  END IF;
  
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'Leader')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF p_scribe_id IS NOT NULL AND p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.archived = false
      AND u.unicorn_role::text IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSIF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, pid, 'Member'
    FROM unnest(p_participant_ids) AS pid
    WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  -- AUTO-SEED attendees from participants right away
  PERFORM seed_meeting_attendees_from_roles(v_meeting_id);
  
  RETURN v_meeting_id;
END;
$function$;

-- =========================================================================
-- Step 8 — Recreate create_meeting_from_template (uuid overload)
-- Only change: remove ::eos_participant_role casts
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid,
  p_scheduled_date timestamp with time zone,
  p_scheduled_end_time timestamp with time zone,
  p_facilitator_id uuid,
  p_scribe_id uuid,
  p_location text DEFAULT NULL::text,
  p_participant_ids uuid[] DEFAULT NULL::uuid[],
  p_title text DEFAULT NULL::text,
  p_series_id uuid DEFAULT NULL::uuid,
  p_tenant_id bigint DEFAULT NULL::bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_id uuid;
  v_template_name text;
  v_template_type text;
  v_meeting_type text;
  v_meeting_scope text;
  v_duration_minutes integer;
  v_agenda_json jsonb;
  v_tenant_id bigint;
  v_is_level10 boolean := false;
  v_participant_count integer := 0;
  v_segment jsonb;
  v_sequence integer := 1;
  v_seg_name text;
  v_seg_duration integer;
BEGIN
  SELECT template_name, template_type::text, duration_minutes, segments, tenant_id,
         COALESCE(meeting_scope, 'tenant')
  INTO v_template_name, v_template_type, v_duration_minutes, v_agenda_json, v_tenant_id, v_meeting_scope
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;
  
  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;
  
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  END IF;
  
  v_meeting_type := COALESCE(v_template_type, v_template_name);
  v_is_level10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_template_name ILIKE '%level%10%');
  
  INSERT INTO public.eos_meetings (
    tenant_id, template_id, title, meeting_type, meeting_scope,
    scheduled_date, scheduled_end_time, duration_minutes,
    facilitator_id, scribe_id, location, agenda, status, series_id
  ) VALUES (
    v_tenant_id, p_template_id,
    COALESCE(p_title, v_template_name || ' - ' || to_char(p_scheduled_date, 'YYYY-MM-DD')),
    v_meeting_type::eos_meeting_type, v_meeting_scope,
    p_scheduled_date, p_scheduled_end_time, v_duration_minutes,
    p_facilitator_id, p_scribe_id, p_location, v_agenda_json, 'scheduled', p_series_id
  )
  RETURNING id INTO v_meeting_id;
  
  -- Create segments with COALESCE to handle both key formats
  IF v_agenda_json IS NOT NULL AND jsonb_array_length(v_agenda_json) > 0 THEN
    FOR v_segment IN SELECT * FROM jsonb_array_elements(v_agenda_json)
    LOOP
      v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
      v_seg_duration := COALESCE(
        (v_segment->>'duration_minutes')::INT,
        (v_segment->>'duration')::INT,
        5
      );
      
      INSERT INTO public.eos_meeting_segments (
        meeting_id, segment_name, duration_minutes, sequence_order
      ) VALUES (
        v_meeting_id, v_seg_name, v_seg_duration, v_sequence
      );
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;
  
  -- Add facilitator
  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader')
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  IF p_scribe_id IS DISTINCT FROM p_facilitator_id THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'Member')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF v_is_level10 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, u.user_uuid, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived = false
      AND u.user_uuid IS NOT NULL
      AND u.user_uuid IS DISTINCT FROM p_facilitator_id
      AND u.user_uuid IS DISTINCT FROM p_scribe_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  ELSE
    IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
      INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
      SELECT v_meeting_id, pid, 'Member'
      FROM unnest(p_participant_ids) AS pid
      WHERE pid IS DISTINCT FROM p_facilitator_id AND pid IS DISTINCT FROM p_scribe_id
      ON CONFLICT (meeting_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- AUTO-SEED attendees from participants right away
  PERFORM seed_meeting_attendees_from_roles(v_meeting_id);
  
  RETURN v_meeting_id;
END;
$function$;

-- =========================================================================
-- Step 9 — Recreate sync_l10_meeting_participants
-- Only change: 'Member'::eos_participant_role → 'Member'
-- =========================================================================
CREATE OR REPLACE FUNCTION public.sync_l10_meeting_participants(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting_type text;
  v_added_count integer := 0;
  v_total_count integer := 0;
BEGIN
  SELECT meeting_type::text INTO v_meeting_type
  FROM eos_meetings
  WHERE id = p_meeting_id;
  
  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  IF v_meeting_type != 'L10' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an L10 meeting');
  END IF;
  
  WITH inserted AS (
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, au.id, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;
  
  SELECT count(*) INTO v_total_count
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'added_count', v_added_count,
    'total_count', v_total_count
  );
END;
$function$;

-- =========================================================================
-- Step 10 — Retain legacy enum with retention comment
-- =========================================================================
COMMENT ON TYPE public.eos_participant_role IS
  'Retained for rollback safety after Phase 5D migration (dd_eos_participant_role). '
  'Do not drop until Phase 5Z cleanup is approved by Carl/Dave. '
  'No columns in any schema are currently typed as this enum.';

-- =========================================================================
-- Step 11 — Post-flight verification checks
-- =========================================================================
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.dd_eos_participant_role) != 3 THEN
    RAISE EXCEPTION 'Post-flight failed: dd_eos_participant_role does not have 3 rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'eos_meeting_participants'
      AND column_name = 'role'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: role column is not text type';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.eos_meeting_participants'::regclass
      AND conname = 'fk_eos_meeting_participants_role'
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: FK constraint not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.eos_meeting_participants
    WHERE role IS NOT NULL
      AND role NOT IN (SELECT value FROM public.dd_eos_participant_role)
  ) THEN
    RAISE EXCEPTION 'Post-flight failed: invalid role values found';
  END IF;

  IF (SELECT COUNT(*) FROM public.eos_meeting_participants) != 162 THEN
    RAISE EXCEPTION 'Post-flight failed: row count changed';
  END IF;
END $$;