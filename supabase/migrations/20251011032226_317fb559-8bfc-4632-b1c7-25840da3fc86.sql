-- Phase 7: AI Assistant, Chat Integrations, Multi-Client Meetings

-- 1. AI Suggestions table
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  meeting_id UUID REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('pre_meeting', 'in_meeting')),
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('issue', 'priority', 'todo')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('shown', 'accepted', 'dismissed')),
  acted_entity_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Slack Integration table
CREATE TABLE IF NOT EXISTS public.integration_slack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  oauth_token TEXT NOT NULL,
  bot_user_id TEXT,
  default_channel TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Teams Integration table
CREATE TABLE IF NOT EXISTS public.integration_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  oauth_token TEXT NOT NULL,
  bot_user_id TEXT,
  default_channel TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. User Integration Preferences
CREATE TABLE IF NOT EXISTS public.user_integration_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL,
  slack_channel TEXT,
  teams_channel TEXT,
  wants_dm BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- 5. EOS Item Clients (many-to-many for multi-client meetings)
CREATE TABLE IF NOT EXISTS public.eos_item_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'headline', 'rock', 'todo')),
  item_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, item_type, client_id)
);

-- 6. Add is_multi_client flag to eos_meetings if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'eos_meetings' 
    AND column_name = 'is_multi_client'
  ) THEN
    ALTER TABLE public.eos_meetings ADD COLUMN is_multi_client BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_slack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integration_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_item_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_suggestions
CREATE POLICY "ai_suggestions_select" ON public.ai_suggestions
  FOR SELECT USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND (
      meeting_id IS NULL OR 
      is_meeting_participant(auth.uid(), meeting_id) OR
      is_eos_admin(auth.uid(), tenant_id)
    ))
  );

CREATE POLICY "ai_suggestions_insert" ON public.ai_suggestions
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant() AND
    (has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  );

CREATE POLICY "ai_suggestions_update" ON public.ai_suggestions
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant() AND
    (has_any_eos_role(auth.uid(), tenant_id) OR is_super_admin())
  );

-- RLS Policies for integration_slack
CREATE POLICY "integration_slack_select" ON public.integration_slack
  FOR SELECT USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
  );

CREATE POLICY "integration_slack_manage" ON public.integration_slack
  FOR ALL USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
  );

-- RLS Policies for integration_teams
CREATE POLICY "integration_teams_select" ON public.integration_teams
  FOR SELECT USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
  );

CREATE POLICY "integration_teams_manage" ON public.integration_teams
  FOR ALL USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
  );

-- RLS Policies for user_integration_prefs
CREATE POLICY "user_integration_prefs_select" ON public.user_integration_prefs
  FOR SELECT USING (
    auth.uid() = user_id OR 
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
  );

CREATE POLICY "user_integration_prefs_manage" ON public.user_integration_prefs
  FOR ALL USING (auth.uid() = user_id OR is_super_admin());

-- RLS Policies for eos_item_clients
CREATE POLICY "eos_item_clients_select" ON public.eos_item_clients
  FOR SELECT USING (
    is_super_admin() OR 
    tenant_id = get_current_user_tenant() OR
    (client_id = (SELECT client_id FROM public.users WHERE user_uuid = auth.uid()))
  );

CREATE POLICY "eos_item_clients_manage" ON public.eos_item_clients
  FOR ALL USING (
    is_super_admin() OR 
    (tenant_id = get_current_user_tenant() AND has_any_eos_role(auth.uid(), tenant_id))
  );

-- RPC: Accept AI Suggestion
CREATE OR REPLACE FUNCTION public.accept_ai_suggestion(p_suggestion_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suggestion RECORD;
  v_entity_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get suggestion
  SELECT * INTO v_suggestion
  FROM public.ai_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR 
    (v_suggestion.tenant_id = get_current_user_tenant() AND 
     has_any_eos_role(auth.uid(), v_suggestion.tenant_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Check if already accepted
  IF v_suggestion.status = 'accepted' THEN
    RETURN v_suggestion.acted_entity_id;
  END IF;

  -- Create entity based on suggestion type
  IF v_suggestion.suggestion_type = 'issue' THEN
    INSERT INTO public.eos_issues (
      tenant_id,
      client_id,
      title,
      description,
      priority,
      status,
      meeting_id,
      created_by
    ) VALUES (
      v_suggestion.tenant_id,
      (v_suggestion.payload->>'client_id')::UUID,
      v_suggestion.payload->>'title',
      v_suggestion.payload->>'description',
      COALESCE((v_suggestion.payload->>'priority')::INTEGER, 0),
      'Open',
      v_suggestion.meeting_id,
      auth.uid()
    ) RETURNING id INTO v_entity_id;

  ELSIF v_suggestion.suggestion_type = 'todo' THEN
    INSERT INTO public.eos_todos (
      tenant_id,
      client_id,
      title,
      description,
      owner_id,
      due_date,
      status,
      meeting_id,
      created_by
    ) VALUES (
      v_suggestion.tenant_id,
      (v_suggestion.payload->>'client_id')::UUID,
      v_suggestion.payload->>'title',
      v_suggestion.payload->>'description',
      (v_suggestion.payload->>'owner_id')::UUID,
      (v_suggestion.payload->>'due_date')::DATE,
      'Open',
      v_suggestion.meeting_id,
      auth.uid()
    ) RETURNING id INTO v_entity_id;
  END IF;

  -- Update suggestion status
  UPDATE public.ai_suggestions
  SET 
    status = 'accepted',
    acted_entity_id = v_entity_id,
    updated_at = now()
  WHERE id = p_suggestion_id;

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
    v_suggestion.tenant_id,
    auth.uid(),
    v_suggestion.meeting_id,
    'ai_suggestion',
    p_suggestion_id,
    'accepted',
    'AI suggestion accepted and entity created',
    jsonb_build_object(
      'suggestion_type', v_suggestion.suggestion_type,
      'entity_id', v_entity_id
    )
  );

  RETURN v_entity_id;
END;
$$;

-- RPC: Cascade Items to Multiple Clients
CREATE OR REPLACE FUNCTION public.cascade_items(
  p_target_client_ids UUID[],
  p_source_item_id UUID,
  p_item_type TEXT
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_new_item_id UUID;
  v_created_ids UUID[] := '{}';
  v_client_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get tenant_id from current user
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = auth.uid();

  -- Verify permissions (admin or facilitator only)
  IF NOT (is_super_admin() OR is_eos_admin(auth.uid(), v_tenant_id)) THEN
    RAISE EXCEPTION 'Only admins can cascade items';
  END IF;

  -- Get source item based on type
  IF p_item_type = 'issue' THEN
    SELECT * INTO v_source FROM public.eos_issues WHERE id = p_source_item_id;
  ELSIF p_item_type = 'todo' THEN
    SELECT * INTO v_source FROM public.eos_todos WHERE id = p_source_item_id;
  ELSIF p_item_type = 'rock' THEN
    SELECT * INTO v_source FROM public.eos_rocks WHERE id = p_source_item_id;
  ELSE
    RAISE EXCEPTION 'Invalid item type';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source item not found';
  END IF;

  -- Create copies for each target client
  FOREACH v_client_id IN ARRAY p_target_client_ids
  LOOP
    IF p_item_type = 'issue' THEN
      INSERT INTO public.eos_issues (
        tenant_id, client_id, title, description, priority, status, meeting_id, created_by
      ) VALUES (
        v_source.tenant_id, v_client_id, v_source.title, v_source.description,
        v_source.priority, v_source.status, v_source.meeting_id, auth.uid()
      ) RETURNING id INTO v_new_item_id;

    ELSIF p_item_type = 'todo' THEN
      INSERT INTO public.eos_todos (
        tenant_id, client_id, title, description, owner_id, due_date, status, meeting_id, created_by
      ) VALUES (
        v_source.tenant_id, v_client_id, v_source.title, v_source.description,
        v_source.owner_id, v_source.due_date, v_source.status, v_source.meeting_id, auth.uid()
      ) RETURNING id INTO v_new_item_id;

    ELSIF p_item_type = 'rock' THEN
      INSERT INTO public.eos_rocks (
        tenant_id, client_id, title, description, owner_id, status, quarter_year,
        quarter_number, due_date, priority, progress, created_by
      ) VALUES (
        v_source.tenant_id, v_client_id, v_source.title, v_source.description,
        v_source.owner_id, v_source.status, v_source.quarter_year,
        v_source.quarter_number, v_source.due_date, v_source.priority,
        v_source.progress, auth.uid()
      ) RETURNING id INTO v_new_item_id;
    END IF;

    v_created_ids := array_append(v_created_ids, v_new_item_id);

    -- Track in eos_item_clients
    INSERT INTO public.eos_item_clients (
      tenant_id, item_type, item_id, client_id
    ) VALUES (
      v_tenant_id, p_item_type, v_new_item_id, v_client_id
    );
  END LOOP;

  RETURN v_created_ids;
END;
$$;