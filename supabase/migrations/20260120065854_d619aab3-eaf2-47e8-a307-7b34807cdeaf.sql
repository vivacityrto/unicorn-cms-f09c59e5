-- =====================================================
-- AGENDA TEMPLATE VERSIONING & AUDIT HISTORY
-- =====================================================

-- 1. Create the template versions table
CREATE TABLE public.eos_agenda_template_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.eos_agenda_templates(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  segments_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  change_summary TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_template_version UNIQUE (template_id, version_number)
);

-- Add indexes for performance
CREATE INDEX idx_template_versions_template ON public.eos_agenda_template_versions(template_id);
CREATE INDEX idx_template_versions_published ON public.eos_agenda_template_versions(template_id, is_published) WHERE is_published = TRUE;

-- Enable RLS
ALTER TABLE public.eos_agenda_template_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for template versions using is_super_admin() function
CREATE POLICY "Users can view versions for their tenant templates"
  ON public.eos_agenda_template_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.eos_agenda_templates t
      JOIN public.users u ON u.tenant_id = t.tenant_id
      WHERE t.id = template_id AND u.user_uuid = auth.uid()
    )
  );

CREATE POLICY "Admins can insert versions"
  ON public.eos_agenda_template_versions
  FOR INSERT
  WITH CHECK (
    public.is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.eos_agenda_templates t
      JOIN public.users u ON u.tenant_id = t.tenant_id
      WHERE t.id = template_id 
        AND u.user_uuid = auth.uid()
        AND u.user_type IN ('Vivacity', 'Client', 'Vivacity Team')
    )
  );

CREATE POLICY "Admins can update versions"
  ON public.eos_agenda_template_versions
  FOR UPDATE
  USING (
    public.is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.eos_agenda_templates t
      JOIN public.users u ON u.tenant_id = t.tenant_id
      WHERE t.id = template_id 
        AND u.user_uuid = auth.uid()
        AND u.user_type IN ('Vivacity', 'Client', 'Vivacity Team')
    )
  );

-- 2. Add version reference columns to templates and meetings
ALTER TABLE public.eos_agenda_templates 
  ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES public.eos_agenda_template_versions(id);

ALTER TABLE public.eos_meetings 
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.eos_agenda_templates(id),
  ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES public.eos_agenda_template_versions(id);

-- 3. Create template audit log table (immutable)
CREATE TABLE public.eos_template_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN (
    'template_created',
    'template_version_created',
    'template_version_published',
    'template_version_restored',
    'template_archived',
    'template_set_default'
  )),
  user_id UUID REFERENCES auth.users(id),
  template_id UUID REFERENCES public.eos_agenda_templates(id) ON DELETE SET NULL,
  version_id UUID REFERENCES public.eos_agenda_template_versions(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL,
  change_summary TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_template_audit_log_template ON public.eos_template_audit_log(template_id);
CREATE INDEX idx_template_audit_log_tenant ON public.eos_template_audit_log(tenant_id);
CREATE INDEX idx_template_audit_log_created ON public.eos_template_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.eos_template_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only view audit logs for their tenant
CREATE POLICY "Users can view audit logs for their tenant"
  ON public.eos_template_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid() AND u.tenant_id = eos_template_audit_log.tenant_id
    )
  );

-- Only authenticated users can insert audit logs (via functions)
CREATE POLICY "Authenticated can insert audit logs"
  ON public.eos_template_audit_log
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Function to create initial version for existing templates
CREATE OR REPLACE FUNCTION public.init_template_versions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_version_id UUID;
BEGIN
  FOR v_template IN 
    SELECT * FROM public.eos_agenda_templates 
    WHERE current_version_id IS NULL
  LOOP
    -- Create version 1
    INSERT INTO public.eos_agenda_template_versions (
      template_id,
      version_number,
      segments_snapshot,
      change_summary,
      is_published,
      created_by,
      created_at
    ) VALUES (
      v_template.id,
      1,
      v_template.segments,
      'Initial version',
      TRUE,
      v_template.created_by,
      v_template.created_at
    ) RETURNING id INTO v_version_id;
    
    -- Set as current version
    UPDATE public.eos_agenda_templates 
    SET current_version_id = v_version_id
    WHERE id = v_template.id;
  END LOOP;
END;
$$;

-- Run initialization
SELECT public.init_template_versions();

-- 5. Function to create a new template version
CREATE OR REPLACE FUNCTION public.create_template_version(
  p_template_id UUID,
  p_segments JSONB,
  p_change_summary TEXT,
  p_publish BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_new_version_number INT;
  v_version_id UUID;
  v_user_id UUID;
  v_tenant_id BIGINT;
BEGIN
  v_user_id := auth.uid();
  
  -- Get template info
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  v_tenant_id := v_template.tenant_id;
  
  -- Check if system template (require duplication instead)
  IF v_template.is_system THEN
    RAISE EXCEPTION 'System templates cannot be edited. Duplicate the template first.';
  END IF;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version_number
  FROM public.eos_agenda_template_versions
  WHERE template_id = p_template_id;
  
  -- Create new version
  INSERT INTO public.eos_agenda_template_versions (
    template_id,
    version_number,
    segments_snapshot,
    change_summary,
    is_published,
    created_by
  ) VALUES (
    p_template_id,
    v_new_version_number,
    p_segments,
    p_change_summary,
    p_publish,
    v_user_id
  ) RETURNING id INTO v_version_id;
  
  -- Update template's segments and current version if published
  IF p_publish THEN
    UPDATE public.eos_agenda_templates
    SET segments = p_segments,
        current_version_id = v_version_id,
        updated_at = NOW()
    WHERE id = p_template_id;
  END IF;
  
  -- Log the action
  INSERT INTO public.eos_template_audit_log (
    action,
    user_id,
    template_id,
    version_id,
    tenant_id,
    change_summary,
    details
  ) VALUES (
    'template_version_created',
    v_user_id,
    p_template_id,
    v_version_id,
    v_tenant_id,
    p_change_summary,
    jsonb_build_object(
      'version_number', v_new_version_number,
      'is_published', p_publish,
      'segments_count', jsonb_array_length(p_segments)
    )
  );
  
  RETURN v_version_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_template_version(UUID, JSONB, TEXT, BOOLEAN) TO authenticated;

-- 6. Function to restore a version as current
CREATE OR REPLACE FUNCTION public.restore_template_version(
  p_version_id UUID,
  p_restore_reason TEXT DEFAULT 'Restored from previous version'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
  v_template RECORD;
  v_new_version_id UUID;
  v_new_version_number INT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Get version info
  SELECT * INTO v_version
  FROM public.eos_agenda_template_versions
  WHERE id = p_version_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Get template info
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = v_version.template_id;
  
  IF v_template.is_system THEN
    RAISE EXCEPTION 'Cannot restore versions for system templates';
  END IF;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version_number
  FROM public.eos_agenda_template_versions
  WHERE template_id = v_version.template_id;
  
  -- Create new version with restored content
  INSERT INTO public.eos_agenda_template_versions (
    template_id,
    version_number,
    segments_snapshot,
    change_summary,
    is_published,
    created_by
  ) VALUES (
    v_version.template_id,
    v_new_version_number,
    v_version.segments_snapshot,
    p_restore_reason || ' (restored from v' || v_version.version_number || ')',
    TRUE,
    v_user_id
  ) RETURNING id INTO v_new_version_id;
  
  -- Update template
  UPDATE public.eos_agenda_templates
  SET segments = v_version.segments_snapshot,
      current_version_id = v_new_version_id,
      updated_at = NOW()
  WHERE id = v_version.template_id;
  
  -- Log the action
  INSERT INTO public.eos_template_audit_log (
    action,
    user_id,
    template_id,
    version_id,
    tenant_id,
    change_summary,
    details
  ) VALUES (
    'template_version_restored',
    v_user_id,
    v_version.template_id,
    v_new_version_id,
    v_template.tenant_id,
    p_restore_reason,
    jsonb_build_object(
      'restored_from_version', v_version.version_number,
      'new_version_number', v_new_version_number
    )
  );
  
  RETURN v_new_version_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_template_version(UUID, TEXT) TO authenticated;

-- 7. Update apply_template_to_meeting to store version reference
CREATE OR REPLACE FUNCTION public.apply_template_to_meeting(
  p_meeting_id UUID,
  p_template_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
BEGIN
  -- Fetch the template with current version
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- Delete existing segments for this meeting
  DELETE FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  -- Insert new segments from template
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order,
      started_at,
      completed_at
    ) VALUES (
      p_meeting_id,
      v_segment->>'segment_name',
      (v_segment->>'duration_minutes')::INT,
      v_sequence,
      NULL,
      NULL
    );
    
    v_total_duration := v_total_duration + (v_segment->>'duration_minutes')::INT;
    v_sequence := v_sequence + 1;
  END LOOP;

  -- Update meeting with duration and template reference
  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration,
      template_id = p_template_id,
      template_version_id = v_template.current_version_id,
      updated_at = NOW()
  WHERE id = p_meeting_id;
END;
$$;

-- 8. Update create_meeting_from_template to store version reference
CREATE OR REPLACE FUNCTION public.create_meeting_from_template(
  p_tenant_id BIGINT,
  p_agenda_template_id UUID,
  p_title TEXT,
  p_scheduled_date TIMESTAMP WITH TIME ZONE,
  p_duration_minutes INT,
  p_facilitator_id UUID,
  p_scribe_id UUID DEFAULT NULL,
  p_participant_ids UUID[] DEFAULT '{}'
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
  v_sequence INT := 1;
  v_total_duration INT := 0;
BEGIN
  -- Fetch template with version
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_agenda_template_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Create the meeting with template reference
  INSERT INTO public.eos_meetings (
    tenant_id,
    meeting_type,
    title,
    scheduled_date,
    duration_minutes,
    template_id,
    template_version_id,
    created_by
  ) VALUES (
    p_tenant_id,
    v_template.meeting_type,
    p_title,
    p_scheduled_date,
    p_duration_minutes,
    p_agenda_template_id,
    v_template.current_version_id,
    auth.uid()
  ) RETURNING id INTO v_meeting_id;
  
  -- Create meeting segments from template
  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    INSERT INTO public.eos_meeting_segments (
      meeting_id,
      segment_name,
      duration_minutes,
      sequence_order
    ) VALUES (
      v_meeting_id,
      v_segment->>'segment_name',
      (v_segment->>'duration_minutes')::INT,
      v_sequence
    );
    
    v_total_duration := v_total_duration + (v_segment->>'duration_minutes')::INT;
    v_sequence := v_sequence + 1;
  END LOOP;
  
  -- Update duration if calculated is different
  IF v_total_duration != p_duration_minutes THEN
    UPDATE public.eos_meetings
    SET duration_minutes = v_total_duration
    WHERE id = v_meeting_id;
  END IF;
  
  -- Add participants if provided
  IF p_facilitator_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_facilitator_id, 'facilitator')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF p_scribe_id IS NOT NULL THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    VALUES (v_meeting_id, p_scribe_id, 'scribe')
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  IF array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.eos_meeting_participants (meeting_id, user_id, role)
    SELECT v_meeting_id, unnest(p_participant_ids), 'participant'
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  
  RETURN v_meeting_id;
END;
$$;