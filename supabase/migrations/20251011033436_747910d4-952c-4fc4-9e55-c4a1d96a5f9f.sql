-- Phase: Quarterly & Annual EOS Meetings
-- Add meeting types, segment types, issue categories, draft tables, and RPCs

-- 1. Extend meeting_type enum if needed (may already exist from Phase 1)
-- Check and add quarterly/annual if not present
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_type') THEN
    CREATE TYPE meeting_type AS ENUM ('level_10', 'quarterly', 'annual');
  ELSE
    -- Add new values if they don't exist
    BEGIN
      ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'quarterly';
      ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'annual';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 2. Add category to eos_issues if not exists
ALTER TABLE public.eos_issues 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'weekly' CHECK (category IN ('weekly', 'quarterly', 'annual'));

-- 3. Create eos_vto_drafts table
CREATE TABLE IF NOT EXISTS public.eos_vto_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  meeting_id UUID REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eos_vto_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vto_drafts_select" ON public.eos_vto_drafts
  FOR SELECT USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id)
    ))
  );

CREATE POLICY "vto_drafts_insert" ON public.eos_vto_drafts
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id) OR 
      is_super_admin()
    )
  );

CREATE POLICY "vto_drafts_update" ON public.eos_vto_drafts
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id) OR 
      is_super_admin()
    )
  );

-- 4. Create eos_chart_drafts table
CREATE TABLE IF NOT EXISTS public.eos_chart_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  meeting_id UUID REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eos_chart_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_drafts_select" ON public.eos_chart_drafts
  FOR SELECT USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id)
    ))
  );

CREATE POLICY "chart_drafts_insert" ON public.eos_chart_drafts
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id) OR 
      is_super_admin()
    )
  );

CREATE POLICY "chart_drafts_update" ON public.eos_chart_drafts
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant() AND (
      is_meeting_participant(auth.uid(), meeting_id) OR 
      is_eos_admin(auth.uid(), tenant_id) OR 
      is_super_admin()
    )
  );

-- 5. Extend eos_meeting_summaries
ALTER TABLE public.eos_meeting_summaries 
ADD COLUMN IF NOT EXISTS meeting_type TEXT,
ADD COLUMN IF NOT EXISTS period_range TEXT,
ADD COLUMN IF NOT EXISTS vto_changes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS chart_changes JSONB DEFAULT '[]'::jsonb;

-- 6. RPC: seed_quarterly_annual_templates
CREATE OR REPLACE FUNCTION public.seed_quarterly_annual_templates()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_quarterly_template_id UUID;
  v_annual_template_id UUID;
BEGIN
  -- Get first tenant or use a default; adjust as needed
  SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found for seeding templates';
  END IF;

  -- Check if quarterly template exists
  SELECT id INTO v_quarterly_template_id 
  FROM public.eos_agenda_templates 
  WHERE tenant_id = v_tenant_id AND meeting_type = 'quarterly' AND is_default = true;

  IF v_quarterly_template_id IS NULL THEN
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, segments, is_default
    ) VALUES (
      v_tenant_id,
      'quarterly',
      'Default Quarterly Meeting',
      '[
        {"name": "Segue & Win Check-in", "duration_minutes": 15},
        {"name": "Scorecard Review (13-week)", "duration_minutes": 30},
        {"name": "Rock Review (Quarter Retrospective)", "duration_minutes": 45},
        {"name": "Customer/Employee Headlines", "duration_minutes": 20},
        {"name": "Issues Parking Lot", "duration_minutes": 15},
        {"name": "V/TO Review (1-Year Plan)", "duration_minutes": 45},
        {"name": "Set Next-Quarter Rocks", "duration_minutes": 90},
        {"name": "Prioritize Issues & IDS", "duration_minutes": 90},
        {"name": "Accountability Chart Updates", "duration_minutes": 30},
        {"name": "Cascading Messages & To-Dos", "duration_minutes": 15},
        {"name": "Conclude & Rate", "duration_minutes": 10}
      ]'::jsonb,
      true
    );
  END IF;

  -- Check if annual template exists
  SELECT id INTO v_annual_template_id 
  FROM public.eos_agenda_templates 
  WHERE tenant_id = v_tenant_id AND meeting_type = 'annual' AND is_default = true;

  IF v_annual_template_id IS NULL THEN
    INSERT INTO public.eos_agenda_templates (
      tenant_id, meeting_type, template_name, segments, is_default
    ) VALUES (
      v_tenant_id,
      'annual',
      'Default Annual Meeting (2-Day)',
      '[
        {"name": "Day 1: Company Review", "duration_minutes": 45},
        {"name": "Day 1: Rock Year-End Retrospective", "duration_minutes": 45},
        {"name": "Day 1: Team Health / People Analyzer", "duration_minutes": 45},
        {"name": "Day 1: SWOT / Issues List", "duration_minutes": 60},
        {"name": "Day 1: Three-Year Picture Refresh", "duration_minutes": 60},
        {"name": "Day 1: One-Year Plan", "duration_minutes": 60},
        {"name": "Day 2: Accountability Chart (Future Org)", "duration_minutes": 45},
        {"name": "Day 2: Set Company Rocks", "duration_minutes": 75},
        {"name": "Day 2: Prioritize Issues & IDS", "duration_minutes": 90},
        {"name": "Day 2: Cascading Messages & To-Dos", "duration_minutes": 30},
        {"name": "Day 2: Conclude & Rate", "duration_minutes": 10}
      ]'::jsonb,
      true
    );
  END IF;
END;
$$;

-- 7. RPC: propose_vto_change
CREATE OR REPLACE FUNCTION public.propose_vto_change(
  p_meeting_id UUID,
  p_draft_json JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_draft_id UUID;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_meeting_participant(auth.uid(), p_meeting_id) OR
    is_eos_admin(auth.uid(), v_meeting.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Upsert draft
  INSERT INTO public.eos_vto_drafts (
    tenant_id, meeting_id, draft_json, created_by
  ) VALUES (
    v_meeting.tenant_id, p_meeting_id, p_draft_json, auth.uid()
  )
  ON CONFLICT (meeting_id) DO UPDATE 
  SET draft_json = p_draft_json, updated_at = now()
  RETURNING id INTO v_draft_id;

  -- Audit
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'vto_draft', v_draft_id, 
    'proposed', 'V/TO change proposed', jsonb_build_object('draft', p_draft_json)
  );

  RETURN v_draft_id;
END;
$$;

-- 8. RPC: propose_chart_change
CREATE OR REPLACE FUNCTION public.propose_chart_change(
  p_meeting_id UUID,
  p_draft_json JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_draft_id UUID;
BEGIN
  -- Get meeting
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_meeting_participant(auth.uid(), p_meeting_id) OR
    is_eos_admin(auth.uid(), v_meeting.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Upsert draft
  INSERT INTO public.eos_chart_drafts (
    tenant_id, meeting_id, draft_json, created_by
  ) VALUES (
    v_meeting.tenant_id, p_meeting_id, p_draft_json, auth.uid()
  )
  ON CONFLICT (meeting_id) DO UPDATE 
  SET draft_json = p_draft_json, updated_at = now()
  RETURNING id INTO v_draft_id;

  -- Audit
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_meeting_id, 'chart_draft', v_draft_id, 
    'proposed', 'Chart change proposed', jsonb_build_object('draft', p_draft_json)
  );

  RETURN v_draft_id;
END;
$$;

-- 9. RPC: carry_forward_unresolved_issues
CREATE OR REPLACE FUNCTION public.carry_forward_unresolved_issues(
  p_meeting_id UUID,
  p_target_meeting_id UUID
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_target_meeting RECORD;
  v_issue RECORD;
  v_new_issue_id UUID;
  v_issue_ids UUID[] := '{}';
BEGIN
  -- Get source meeting
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source meeting not found'; END IF;

  -- Get target meeting
  SELECT * INTO v_target_meeting FROM public.eos_meetings WHERE id = p_target_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target meeting not found'; END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    is_eos_admin(auth.uid(), v_meeting.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Copy unresolved issues
  FOR v_issue IN 
    SELECT * FROM public.eos_issues 
    WHERE meeting_id = p_meeting_id AND status != 'Solved'
  LOOP
    INSERT INTO public.eos_issues (
      tenant_id, client_id, title, description, status, priority,
      category, raised_by, meeting_id, created_by
    ) VALUES (
      v_target_meeting.tenant_id, v_issue.client_id, v_issue.title,
      v_issue.description, 'Open', v_issue.priority,
      v_issue.category, v_issue.raised_by, p_target_meeting_id, auth.uid()
    ) RETURNING id INTO v_new_issue_id;

    v_issue_ids := array_append(v_issue_ids, v_new_issue_id);
  END LOOP;

  -- Audit
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, meeting_id, entity, action, reason, details
  ) VALUES (
    v_meeting.tenant_id, auth.uid(), p_target_meeting_id, 'issue', 
    'carried_forward', 'Issues carried forward', 
    jsonb_build_object('count', array_length(v_issue_ids, 1), 'issue_ids', v_issue_ids)
  );

  RETURN v_issue_ids;
END;
$$;

-- 10. Add missing unique constraint on drafts
ALTER TABLE public.eos_vto_drafts 
DROP CONSTRAINT IF EXISTS eos_vto_drafts_meeting_id_key;

ALTER TABLE public.eos_vto_drafts 
ADD CONSTRAINT eos_vto_drafts_meeting_id_key UNIQUE (meeting_id);

ALTER TABLE public.eos_chart_drafts 
DROP CONSTRAINT IF EXISTS eos_chart_drafts_meeting_id_key;

ALTER TABLE public.eos_chart_drafts 
ADD CONSTRAINT eos_chart_drafts_meeting_id_key UNIQUE (meeting_id);