-- Phase 2: EOS Meeting Core - Only Missing Components

-- Create only new enums
DO $$ BEGIN
  CREATE TYPE public.eos_meeting_role AS ENUM ('Leader', 'Member', 'Observer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.eos_segment_type AS ENUM ('Segue', 'Scorecard', 'Rocks', 'Headlines', 'Todos', 'IDS', 'Conclude');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- eos_meeting_participants table (new)
CREATE TABLE IF NOT EXISTS public.eos_meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.eos_meeting_role NOT NULL DEFAULT 'Member',
  attended BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

-- eos_meeting_segments table (new)
CREATE TABLE IF NOT EXISTS public.eos_meeting_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,
  sequence_order INT NOT NULL,
  duration_minutes INT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recreate eos_headlines with meeting_id (drop and recreate)
DROP TABLE IF EXISTS public.eos_headlines CASCADE;
CREATE TABLE public.eos_headlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id UUID,
  headline TEXT NOT NULL,
  is_good_news BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON public.eos_meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON public.eos_meeting_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_segments_meeting ON public.eos_meeting_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_segments_order ON public.eos_meeting_segments(meeting_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_headlines_meeting ON public.eos_headlines(meeting_id);

-- Enable RLS
ALTER TABLE public.eos_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_headlines ENABLE ROW LEVEL SECURITY;

-- Security helper functions
CREATE OR REPLACE FUNCTION public.has_meeting_role(_user_id UUID, _meeting_id UUID, _roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_meeting_participants emp
    WHERE emp.meeting_id = _meeting_id
      AND emp.user_id = _user_id
      AND emp.role::text = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_participant(_user_id UUID, _meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eos_meeting_participants emp
    WHERE emp.meeting_id = _meeting_id
      AND emp.user_id = _user_id
  )
$$;

-- RLS for eos_meeting_participants
DROP POLICY IF EXISTS "meeting_participants_select" ON public.eos_meeting_participants;
CREATE POLICY "meeting_participants_select"
  ON public.eos_meeting_participants FOR SELECT
  USING (
    is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.eos_meetings m 
      WHERE m.id = meeting_id 
      AND (m.tenant_id = get_current_user_tenant() OR is_meeting_participant(auth.uid(), meeting_id))
    )
  );

DROP POLICY IF EXISTS "meeting_participants_insert" ON public.eos_meeting_participants;
CREATE POLICY "meeting_participants_insert"
  ON public.eos_meeting_participants FOR INSERT
  WITH CHECK (
    is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.eos_meetings m 
      WHERE m.id = meeting_id 
      AND m.tenant_id = get_current_user_tenant()
    )
  );

DROP POLICY IF EXISTS "meeting_participants_update" ON public.eos_meeting_participants;
CREATE POLICY "meeting_participants_update"
  ON public.eos_meeting_participants FOR UPDATE
  USING (is_super_admin() OR has_meeting_role(auth.uid(), meeting_id, ARRAY['Leader']));

DROP POLICY IF EXISTS "meeting_participants_delete" ON public.eos_meeting_participants;
CREATE POLICY "meeting_participants_delete"
  ON public.eos_meeting_participants FOR DELETE
  USING (is_super_admin() OR has_meeting_role(auth.uid(), meeting_id, ARRAY['Leader']));

-- RLS for eos_meeting_segments
DROP POLICY IF EXISTS "meeting_segments_select" ON public.eos_meeting_segments;
CREATE POLICY "meeting_segments_select"
  ON public.eos_meeting_segments FOR SELECT
  USING (is_super_admin() OR is_meeting_participant(auth.uid(), meeting_id));

DROP POLICY IF EXISTS "meeting_segments_insert" ON public.eos_meeting_segments;
CREATE POLICY "meeting_segments_insert"
  ON public.eos_meeting_segments FOR INSERT
  WITH CHECK (is_super_admin() OR has_meeting_role(auth.uid(), meeting_id, ARRAY['Leader']));

DROP POLICY IF EXISTS "meeting_segments_update" ON public.eos_meeting_segments;
CREATE POLICY "meeting_segments_update"
  ON public.eos_meeting_segments FOR UPDATE
  USING (is_super_admin() OR has_meeting_role(auth.uid(), meeting_id, ARRAY['Leader']));

DROP POLICY IF EXISTS "meeting_segments_delete" ON public.eos_meeting_segments;
CREATE POLICY "meeting_segments_delete"
  ON public.eos_meeting_segments FOR DELETE
  USING (is_super_admin());

-- RLS for eos_headlines (recreate)
CREATE POLICY "eos_headlines_select"
  ON public.eos_headlines FOR SELECT
  USING (is_super_admin() OR is_meeting_participant(auth.uid(), meeting_id));

CREATE POLICY "eos_headlines_insert"
  ON public.eos_headlines FOR INSERT
  WITH CHECK (
    is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.eos_meetings m 
      WHERE m.id = meeting_id 
      AND (m.tenant_id = get_current_user_tenant() OR is_meeting_participant(auth.uid(), meeting_id))
    )
  );

CREATE POLICY "eos_headlines_update"
  ON public.eos_headlines FOR UPDATE
  USING (is_super_admin() OR user_id = auth.uid());

CREATE POLICY "eos_headlines_delete"
  ON public.eos_headlines FOR DELETE
  USING (is_super_admin() OR user_id = auth.uid());

-- RPC: Create meeting from template
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id BIGINT,
  p_agenda_template_id UUID,
  p_title TEXT,
  p_scheduled_date TIMESTAMPTZ,
  p_duration_minutes INT,
  p_facilitator_id UUID,
  p_scribe_id UUID DEFAULT NULL,
  p_participant_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id UUID;
  v_template RECORD;
  v_segment JSONB;
  v_order INT := 0;
  v_participant UUID;
BEGIN
  -- Verify user has EOS access
  IF NOT (has_any_eos_role(auth.uid(), p_tenant_id) OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: EOS role required';
  END IF;

  -- Get template
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- Create meeting
  INSERT INTO public.eos_meetings (
    tenant_id,
    client_id,
    meeting_type,
    title,
    scheduled_date,
    duration_minutes,
    scorecard_data,
    rock_reviews,
    headlines,
    issues_discussed,
    is_complete,
    created_by
  ) VALUES (
    p_tenant_id,
    NULL,
    v_template.meeting_type,
    p_title,
    p_scheduled_date,
    p_duration_minutes,
    '{}'::jsonb,
    ARRAY[]::jsonb[],
    ARRAY[]::text[],
    ARRAY[]::text[],
    false,
    auth.uid()
  ) RETURNING id INTO v_meeting_id;

  -- Add facilitator as participant
  INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role, attended)
  VALUES (v_meeting_id, p_facilitator_id, 'Leader', false);

  -- Add scribe if provided
  IF p_scribe_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role, attended)
    VALUES (v_meeting_id, p_scribe_id, 'Member', false)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Add other participants
  FOREACH v_participant IN ARRAY p_participant_ids
  LOOP
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role, attended)
    VALUES (v_meeting_id, v_participant, 'Member', false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Create segments from template
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order
    ) VALUES (
      v_meeting_id,
      v_segment->>'name',
      (v_segment->>'duration_minutes')::INT,
      v_order
    );
    v_order := v_order + 1;
  END LOOP;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    meeting_id,
    entity,
    entity_id,
    action,
    reason,
    details
  ) VALUES (
    p_tenant_id,
    auth.uid(),
    v_meeting_id,
    'meeting',
    v_meeting_id,
    'created',
    'Meeting created from template',
    jsonb_build_object(
      'template_id', p_agenda_template_id,
      'facilitator_id', p_facilitator_id
    )
  );

  RETURN v_meeting_id;
END;
$$;

-- RPC: Advance segment
CREATE OR REPLACE FUNCTION public.advance_segment(p_meeting_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_segment UUID;
  v_next_segment UUID;
  v_meeting RECORD;
BEGIN
  -- Get meeting and verify facilitator
  SELECT m.*, emp.role INTO v_meeting
  FROM public.eos_meetings m
  LEFT JOIN public.eos_meeting_participants emp ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Only facilitator (Leader) can advance
  IF v_meeting.role != 'Leader' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only facilitator can advance segments';
  END IF;

  -- End current segment
  UPDATE public.eos_meeting_segments
  SET completed_at = now()
  WHERE meeting_id = p_meeting_id
    AND started_at IS NOT NULL
    AND completed_at IS NULL
  RETURNING id INTO v_current_segment;

  -- Start next segment
  UPDATE public.eos_meeting_segments
  SET started_at = now()
  WHERE meeting_id = p_meeting_id
    AND started_at IS NULL
    AND sequence_order = (
      SELECT MIN(sequence_order)
      FROM public.eos_meeting_segments
      WHERE meeting_id = p_meeting_id
        AND started_at IS NULL
    )
  RETURNING id INTO v_next_segment;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    meeting_id,
    entity,
    entity_id,
    action,
    details
  ) VALUES (
    v_meeting.tenant_id,
    auth.uid(),
    p_meeting_id,
    'segment',
    v_next_segment,
    'advanced',
    jsonb_build_object(
      'from_segment', v_current_segment,
      'to_segment', v_next_segment
    )
  );

  RETURN v_next_segment;
END;
$$;

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_eos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_meeting_id UUID;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_tenant_id := NEW.tenant_id;
    v_meeting_id := NEW.meeting_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_tenant_id := NEW.tenant_id;
    v_meeting_id := NEW.meeting_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_tenant_id := OLD.tenant_id;
    v_meeting_id := OLD.meeting_id;
  END IF;

  INSERT INTO public.audit_eos_events (
    tenant_id,
    user_id,
    meeting_id,
    entity,
    entity_id,
    action,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    v_meeting_id,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_action,
    CASE
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply triggers
DROP TRIGGER IF EXISTS audit_headlines_changes ON public.eos_headlines;
CREATE TRIGGER audit_headlines_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_headlines
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();

DROP TRIGGER IF EXISTS audit_segments_changes ON public.eos_meeting_segments;
CREATE TRIGGER audit_segments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_meeting_segments
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();