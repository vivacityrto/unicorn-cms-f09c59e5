
-- =========================================================
-- Pre-flight: ensure is_vivacity_internal is backfilled
-- =========================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE unicorn_role IN ('Integrator','BGT','CSC','CET')
      AND COALESCE(is_vivacity_internal,false) = false
      AND COALESCE(disabled,false) = false
  ) THEN
    RAISE EXCEPTION 'is_vivacity_internal not backfilled — run backfill before this migration';
  END IF;
END $$;

-- =========================================================
-- Canonical staff check
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = p_user_id
      AND u.is_vivacity_internal = true
      AND COALESCE(u.archived, false) = false
      AND COALESCE(u.disabled, false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_any_team_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT public.is_vivacity_team_safe(p_user_id);
$$;

-- =========================================================
-- Stale variant aliases — delegate to canonical
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_vivacity_staff(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_team_rls(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_team_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_team_v2(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_team()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.is_vivacity_team(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.can_access_vivacity_meetings(user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT public.is_vivacity_team_safe(user_id); $$;

-- =========================================================
-- Grants
-- =========================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'is_vivacity_team_safe(uuid)', 'is_any_team_member(uuid)',
    'is_vivacity_staff(uuid)', 'is_vivacity_member(uuid)',
    'is_vivacity_team_rls(uuid)', 'is_vivacity_team_user(uuid)',
    'is_vivacity_team_v2(uuid)', 'is_vivacity()',
    'is_vivacity_team()', 'is_vivacity_team(uuid)',
    'is_staff()', 'can_access_vivacity_meetings(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- =========================================================
-- EOS + notify function rewrites
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id bigint, p_agenda_template_id uuid, p_title text,
  p_scheduled_date timestamp with time zone, p_duration_minutes integer,
  p_facilitator_id uuid, p_scribe_id uuid DEFAULT NULL::uuid,
  p_participant_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
  SELECT * INTO v_template FROM public.eos_agenda_templates WHERE id = p_agenda_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  v_is_level10 := (v_template.meeting_type::text ILIKE '%L10%' OR v_template.meeting_type::text ILIKE '%level%10%');

  INSERT INTO public.eos_meetings (
    tenant_id, meeting_type, title, scheduled_date, duration_minutes,
    template_id, template_version_id, created_by
  ) VALUES (
    p_tenant_id, v_template.meeting_type, p_title, p_scheduled_date,
    p_duration_minutes, p_agenda_template_id, v_template.current_version_id, auth.uid()
  ) RETURNING id INTO v_meeting_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
    v_seg_duration := COALESCE((v_segment->>'duration_minutes')::INT, (v_segment->>'duration')::INT, 5);
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    VALUES (v_meeting_id, v_seg_name, v_seg_duration, v_sequence);
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
      AND u.is_vivacity_internal = true
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

  PERFORM public.seed_meeting_attendees_from_roles(v_meeting_id);
  RETURN v_meeting_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_template_id uuid, p_scheduled_date timestamp with time zone,
  p_scheduled_end_time timestamp with time zone, p_facilitator_id uuid,
  p_scribe_id uuid, p_location text DEFAULT NULL::text,
  p_participant_ids uuid[] DEFAULT NULL::uuid[], p_title text DEFAULT NULL::text,
  p_series_id uuid DEFAULT NULL::uuid, p_tenant_id bigint DEFAULT NULL::bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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

  IF p_tenant_id IS NOT NULL THEN v_tenant_id := p_tenant_id; END IF;

  v_meeting_type := COALESCE(v_template_type, v_template_name);
  v_is_level10 := (v_meeting_type ILIKE '%L10%' OR v_meeting_type ILIKE '%level%10%' OR v_template_name ILIKE '%level%10%');

  INSERT INTO public.eos_meetings (
    tenant_id, template_id, title, meeting_type, meeting_scope,
    scheduled_date, scheduled_end_time, duration_minutes,
    facilitator_id, scribe_id, location, agenda, status, series_id
  ) VALUES (
    v_tenant_id, p_template_id,
    COALESCE(p_title, v_template_name || ' - ' || to_char(p_scheduled_date, 'YYYY-MM-DD')),
    v_meeting_type, v_meeting_scope,
    p_scheduled_date, p_scheduled_end_time, v_duration_minutes,
    p_facilitator_id, p_scribe_id, p_location, v_agenda_json, 'scheduled', p_series_id
  ) RETURNING id INTO v_meeting_id;

  IF v_agenda_json IS NOT NULL AND jsonb_array_length(v_agenda_json) > 0 THEN
    FOR v_segment IN SELECT * FROM jsonb_array_elements(v_agenda_json)
    LOOP
      v_seg_name := COALESCE(v_segment->>'segment_name', v_segment->>'name', 'Untitled Segment');
      v_seg_duration := COALESCE((v_segment->>'duration_minutes')::INT, (v_segment->>'duration')::INT, 5);
      INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
        VALUES (v_meeting_id, v_seg_name, v_seg_duration, v_sequence);
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;

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
    WHERE u.is_vivacity_internal = true
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

  PERFORM public.seed_meeting_attendees_from_roles(v_meeting_id);
  RETURN v_meeting_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_level10_participants()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.eos_meetings m
    WHERE m.id = NEW.meeting_id
      AND m.meeting_type::text ILIKE '%level%'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = NEW.user_id
        AND u.is_vivacity_internal = true
        AND u.archived IS DISTINCT FROM true
    ) THEN
      RAISE EXCEPTION 'User is not Vivacity Team, cannot be added to Level 10 meeting';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_l10_meeting_participants(p_meeting_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_meeting_type text;
  v_added_count integer := 0;
  v_total_count integer := 0;
BEGIN
  SELECT meeting_type::text INTO v_meeting_type
  FROM public.eos_meetings WHERE id = p_meeting_id;

  IF v_meeting_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  IF v_meeting_type != 'L10' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an L10 meeting');
  END IF;

  WITH inserted AS (
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT p_meeting_id, au.id, 'Member'
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.is_vivacity_internal = true
      AND u.archived IS DISTINCT FROM true
    ON CONFLICT (meeting_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*) INTO v_added_count FROM inserted;

  SELECT count(*) INTO v_total_count
  FROM public.eos_meeting_participants WHERE meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', p_meeting_id,
    'added_count', v_added_count, 'total_count', v_total_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_notify_csc_on_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.channel = 'support' THEN
    INSERT INTO public.user_notifications
      (user_id, tenant_id, type, title, message, metadata, source_id)
    SELECT
      u.user_uuid, NEW.tenant_id, 'support_ticket',
      'New support ticket', 'A client has submitted a support request.',
      jsonb_build_object('thread_id', NEW.id, 'tenant_id', NEW.tenant_id, 'user_id', NEW.user_id),
      NEW.id::text
    FROM public.users u
    WHERE u.is_vivacity_internal = true
      AND u.email NOT LIKE '%+%'
      AND u.email LIKE '%@vivacity.com.au'
      AND u.user_uuid IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory()
RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url
  FROM public.users u
  WHERE u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory_staff()
RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text, email text, job_title text, unicorn_role text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url,
         u.email, u.job_title, u.unicorn_role
  FROM public.users u
  WHERE public.is_vivacity_team_safe(auth.uid())
    AND u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

-- =========================================================
-- Post-migration verification
-- =========================================================
DO $$
DECLARE r record; bad int := 0;
BEGIN
  FOR r IN
    SELECT user_uuid, email, unicorn_role
    FROM public.users
    WHERE unicorn_role IN ('Integrator','BGT','CSC','CET')
      AND COALESCE(disabled,false) = false
  LOOP
    IF NOT public.is_vivacity_team_safe(r.user_uuid) THEN
      bad := bad + 1;
      RAISE WARNING 'NOT STAFF: % %', r.email, r.unicorn_role;
    END IF;
  END LOOP;
  IF bad > 0 THEN
    RAISE EXCEPTION '% new-role users still failing is_vivacity_team_safe', bad;
  END IF;
END $$;
