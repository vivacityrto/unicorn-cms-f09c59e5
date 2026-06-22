CREATE OR REPLACE FUNCTION public.auto_generate_next_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_series RECORD;
  v_next_date timestamptz;
  v_next_meeting_id uuid;
  v_copied_count int := 0;
BEGIN
  -- Only proceed if status changed to closed or completed
  IF NEW.status NOT IN ('closed', 'completed') OR OLD.status IN ('closed', 'completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.series_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_series
  FROM public.eos_meeting_series
  WHERE id = NEW.series_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE v_series.recurrence_type
    WHEN 'weekly'    THEN v_next_date := NEW.scheduled_date + interval '7 days';
    WHEN 'biweekly'  THEN v_next_date := NEW.scheduled_date + interval '14 days';
    WHEN 'monthly'   THEN v_next_date := NEW.scheduled_date + interval '1 month';
    WHEN 'quarterly' THEN v_next_date := NEW.scheduled_date + interval '3 months';
    WHEN 'annual'    THEN v_next_date := NEW.scheduled_date + interval '1 year';
    ELSE RETURN NEW;
  END CASE;

  -- Idempotency: skip if next occurrence already exists
  IF EXISTS (
    SELECT 1 FROM public.eos_meetings
    WHERE series_id = NEW.series_id
      AND scheduled_date::date = v_next_date::date
      AND id != NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Create next meeting (now copying template_id and template_version_id)
  INSERT INTO public.eos_meetings (
    tenant_id, title, meeting_type, scheduled_date, duration_minutes,
    series_id, status, workspace_id, meeting_scope, previous_meeting_id, created_by,
    template_id, template_version_id
  )
  VALUES (
    NEW.tenant_id, NEW.title, NEW.meeting_type, v_next_date, NEW.duration_minutes,
    NEW.series_id, 'scheduled', NEW.workspace_id, NEW.meeting_scope, NEW.id, NEW.created_by,
    NEW.template_id, NEW.template_version_id
  )
  RETURNING id INTO v_next_meeting_id;

  -- Link previous meeting forward
  UPDATE public.eos_meetings SET next_meeting_id = v_next_meeting_id WHERE id = NEW.id;

  -- Copy agenda segments (idempotent; skip if template missing or already populated)
  IF NEW.template_id IS NOT NULL
     AND (SELECT COUNT(*) FROM public.eos_meeting_segments WHERE meeting_id = v_next_meeting_id) = 0
  THEN
    INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
    SELECT v_next_meeting_id, segment_name, duration_minutes, sequence_order
    FROM public.eos_meeting_segments
    WHERE meeting_id = NEW.id;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;

    IF v_copied_count > 0 THEN
      INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
      VALUES (
        NEW.tenant_id, 'meeting', v_next_meeting_id,
        'meeting_segments_copied', auth.uid(),
        jsonb_build_object(
          'source_meeting_id', NEW.id,
          'target_meeting_id', v_next_meeting_id,
          'segments_copied', v_copied_count
        )
      );
    END IF;
  END IF;

  -- Original auto-generation audit event (preserved)
  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    NEW.tenant_id, 'meeting', v_next_meeting_id,
    'meeting_auto_generated', auth.uid(),
    jsonb_build_object('source_meeting_id', NEW.id, 'scheduled_date', v_next_date)
  );

  RETURN NEW;
END;
$function$;