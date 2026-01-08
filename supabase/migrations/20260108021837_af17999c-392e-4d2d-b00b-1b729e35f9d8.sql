-- Calendar Events table (stores synced Outlook events)
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'outlook',
  provider_event_id text NOT NULL,
  calendar_id text NOT NULL,
  organizer_email text NULL,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  meeting_url text NULL,
  status text NOT NULL DEFAULT 'confirmed',
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_unique_provider_event UNIQUE (tenant_id, provider, provider_event_id, user_id)
);

-- Calendar Time Drafts table (draft time entries from meetings)
CREATE TABLE public.calendar_time_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  client_id bigint NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  package_id bigint NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id bigint NULL REFERENCES public.documents_stages(id) ON DELETE SET NULL,
  minutes int NOT NULL,
  work_date date NOT NULL,
  notes text NULL,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  suggestion jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  posted_time_entry_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for calendar_time_drafts
CREATE INDEX idx_calendar_time_drafts_tenant_user_status ON public.calendar_time_drafts(tenant_id, created_by, status);
CREATE UNIQUE INDEX idx_calendar_time_drafts_unique_draft ON public.calendar_time_drafts(tenant_id, created_by, calendar_event_id) WHERE status = 'draft';

-- Index for calendar_events
CREATE INDEX idx_calendar_events_tenant_user ON public.calendar_events(tenant_id, user_id);
CREATE INDEX idx_calendar_events_start_at ON public.calendar_events(start_at);

-- Add calendar_event_id to time_entries
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS calendar_event_id uuid NULL REFERENCES public.calendar_events(id) ON DELETE SET NULL;

-- OAuth tokens table for storing user tokens securely
CREATE TABLE public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'microsoft',
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_tokens_unique_user_provider UNIQUE (user_id, provider)
);

-- Enable RLS on all new tables
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_time_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS for calendar_events: users can only see their own events
CREATE POLICY "Users can view own calendar events" ON public.calendar_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage calendar events" ON public.calendar_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS for calendar_time_drafts
CREATE POLICY "Users can view own drafts" ON public.calendar_time_drafts
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own drafts" ON public.calendar_time_drafts
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own drafts" ON public.calendar_time_drafts
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own drafts" ON public.calendar_time_drafts
  FOR DELETE USING (auth.uid() = created_by);

-- RLS for oauth_tokens: users can only see/manage their own tokens
CREATE POLICY "Users can view own tokens" ON public.oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own tokens" ON public.oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

-- RPC: Create time draft from calendar event
CREATE OR REPLACE FUNCTION public.rpc_create_time_draft_from_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.calendar_events;
  v_draft_id uuid;
  v_user_id uuid;
  v_tenant_id bigint;
  v_minutes int;
  v_work_date date;
  v_existing_draft uuid;
  v_suggestion jsonb;
  v_confidence numeric(5,2);
  v_client_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_client_match record;
BEGIN
  v_user_id := auth.uid();
  
  -- Get the event
  SELECT * INTO v_event FROM public.calendar_events WHERE id = p_event_id AND user_id = v_user_id;
  
  IF v_event IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'event_not_found');
  END IF;
  
  v_tenant_id := v_event.tenant_id;
  
  -- Check for existing draft
  SELECT id INTO v_existing_draft 
  FROM public.calendar_time_drafts 
  WHERE calendar_event_id = p_event_id 
    AND created_by = v_user_id 
    AND status = 'draft';
  
  IF v_existing_draft IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'draft_exists', 'draft_id', v_existing_draft);
  END IF;
  
  -- Calculate minutes from event duration
  v_minutes := EXTRACT(EPOCH FROM (v_event.end_at - v_event.start_at)) / 60;
  v_work_date := v_event.start_at::date;
  
  -- Build suggestion and matching logic
  v_suggestion := jsonb_build_object('signals', '[]'::jsonb, 'candidates', '[]'::jsonb);
  v_confidence := 0;
  
  -- Try to match attendee emails to tenant users/clients
  -- Match attendees against users table emails that belong to clients
  FOR v_client_match IN 
    SELECT DISTINCT t.id as client_id, t.name as client_name, u.email as matched_email
    FROM public.users u
    JOIN public.tenant_users tu ON tu.user_id = u.user_uuid
    JOIN public.tenants t ON t.id = tu.tenant_id
    WHERE u.email = ANY(
      SELECT jsonb_array_elements_text(v_event.attendees::jsonb->'emails')
    )
    AND t.id != v_tenant_id
    LIMIT 1
  LOOP
    v_client_id := v_client_match.client_id;
    v_confidence := v_confidence + 0.6;
    v_suggestion := jsonb_set(v_suggestion, '{signals}', 
      (v_suggestion->'signals') || jsonb_build_object(
        'type', 'attendee_match',
        'email', v_client_match.matched_email,
        'client', v_client_match.client_name,
        'weight', 0.6
      )
    );
  END LOOP;
  
  -- Cap confidence at 1.0
  IF v_confidence > 1.0 THEN
    v_confidence := 1.0;
  END IF;
  
  -- Auto-fill client only if confidence >= 0.85
  IF v_confidence < 0.85 THEN
    v_client_id := NULL;
  END IF;
  
  -- Create the draft
  INSERT INTO public.calendar_time_drafts (
    tenant_id, created_by, calendar_event_id, client_id, package_id, stage_id,
    minutes, work_date, notes, confidence, suggestion, status
  ) VALUES (
    v_tenant_id, v_user_id, p_event_id, v_client_id, v_package_id, v_stage_id,
    v_minutes, v_work_date, 'Meeting: ' || v_event.title, v_confidence, v_suggestion, 'draft'
  )
  RETURNING id INTO v_draft_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'draft_id', v_draft_id,
    'confidence', v_confidence,
    'suggestion', v_suggestion
  );
END;
$$;

-- RPC: Post time draft (converts to time_entry)
CREATE OR REPLACE FUNCTION public.rpc_post_time_draft(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_draft public.calendar_time_drafts;
  v_user_id uuid;
  v_time_entry_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Get the draft
  SELECT * INTO v_draft 
  FROM public.calendar_time_drafts 
  WHERE id = p_draft_id AND created_by = v_user_id AND status = 'draft';
  
  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'draft_not_found');
  END IF;
  
  -- Validate required fields
  IF v_draft.client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_required');
  END IF;
  
  IF v_draft.minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, user_id, work_type, is_billable,
    start_at, duration_minutes, notes, source, calendar_event_id
  ) VALUES (
    v_draft.tenant_id, v_draft.client_id, v_draft.package_id, v_draft.stage_id,
    v_user_id, 'meeting', true,
    v_draft.work_date::timestamptz, v_draft.minutes, v_draft.notes, 'calendar', v_draft.calendar_event_id
  )
  RETURNING id INTO v_time_entry_id;
  
  -- Update draft status
  UPDATE public.calendar_time_drafts 
  SET status = 'posted', posted_time_entry_id = v_time_entry_id, updated_at = now()
  WHERE id = p_draft_id;
  
  RETURN jsonb_build_object('success', true, 'time_entry_id', v_time_entry_id);
END;
$$;

-- RPC: Discard time draft
CREATE OR REPLACE FUNCTION public.rpc_discard_time_draft(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_updated int;
BEGIN
  v_user_id := auth.uid();
  
  UPDATE public.calendar_time_drafts 
  SET status = 'discarded', updated_at = now()
  WHERE id = p_draft_id AND created_by = v_user_id AND status = 'draft';
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'draft_not_found');
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;