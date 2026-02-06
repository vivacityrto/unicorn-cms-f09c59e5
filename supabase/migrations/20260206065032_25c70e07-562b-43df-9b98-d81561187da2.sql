-- =====================================================
-- Teams Meeting Capture Feature
-- Creates meetings, meeting_participants, meeting_notes tables
-- with RLS policies for secure multi-user access
-- =====================================================

-- 1. Create meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id bigint NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  package_id bigint NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  owner_user_uuid uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'microsoft',
  external_event_id text NOT NULL,
  external_meeting_url text NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NULL,
  location text NULL,
  is_online boolean DEFAULT true,
  is_organizer boolean DEFAULT false,
  provider_payload jsonb NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  needs_linking boolean DEFAULT false,
  time_draft_created boolean DEFAULT false,
  sensitivity text DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_uuid, provider, external_event_id)
);

-- 2. Create meeting_participants table
CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  participant_email text NOT NULL,
  participant_name text NULL,
  participant_type text NOT NULL DEFAULT 'required' CHECK (participant_type IN ('required', 'optional', 'organizer')),
  attended boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_email ON public.meeting_participants(participant_email);

-- 3. Create meeting_notes table
CREATE TABLE public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  notes text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_notes_meeting_id ON public.meeting_notes(meeting_id);

-- 4. Create meeting_action_items table for tasks created from meetings
CREATE TABLE public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  task_id text NULL,
  description text NOT NULL,
  assigned_to uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  due_date date NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_action_items_meeting_id ON public.meeting_action_items(meeting_id);

-- 5. Create meeting_sync_log for audit
CREATE TABLE public.meeting_sync_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL,
  meetings_created integer DEFAULT 0,
  meetings_updated integer DEFAULT 0,
  meetings_skipped integer DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create indexes on meetings table
CREATE INDEX idx_meetings_tenant_id ON public.meetings(tenant_id);
CREATE INDEX idx_meetings_owner_user_uuid ON public.meetings(owner_user_uuid);
CREATE INDEX idx_meetings_client_id ON public.meetings(client_id);
CREATE INDEX idx_meetings_starts_at ON public.meetings(starts_at);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meetings_needs_linking ON public.meetings(needs_linking) WHERE needs_linking = true;

-- 7. Enable RLS on all tables
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_sync_audit ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for meetings
CREATE POLICY "Users can view own meetings"
  ON public.meetings
  FOR SELECT
  USING (owner_user_uuid = auth.uid());

CREATE POLICY "Users can view shared meetings"
  ON public.meetings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_shares cs
      WHERE cs.owner_user_uuid = meetings.owner_user_uuid
      AND cs.viewer_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can insert own meetings"
  ON public.meetings
  FOR INSERT
  WITH CHECK (owner_user_uuid = auth.uid());

CREATE POLICY "Users can update own meetings"
  ON public.meetings
  FOR UPDATE
  USING (owner_user_uuid = auth.uid());

-- 9. RLS Policies for meeting_participants
CREATE POLICY "Users can view participants of own meetings"
  ON public.meeting_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can view participants of shared meetings with details"
  ON public.meeting_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.calendar_shares cs ON cs.owner_user_uuid = m.owner_user_uuid
      WHERE m.id = meeting_participants.meeting_id
      AND cs.viewer_user_uuid = auth.uid()
      AND cs.scope = 'details'
    )
  );

CREATE POLICY "Users can insert participants to own meetings"
  ON public.meeting_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can delete participants from own meetings"
  ON public.meeting_participants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

-- 10. RLS Policies for meeting_notes
CREATE POLICY "Users can view notes on own meetings"
  ON public.meeting_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_notes.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can add notes to own meetings"
  ON public.meeting_notes
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_notes.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can update own notes"
  ON public.meeting_notes
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON public.meeting_notes
  FOR DELETE
  USING (created_by = auth.uid());

-- 11. RLS Policies for meeting_action_items
CREATE POLICY "Users can view action items on own meetings"
  ON public.meeting_action_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_action_items.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can add action items to own meetings"
  ON public.meeting_action_items
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_action_items.meeting_id
      AND m.owner_user_uuid = auth.uid()
    )
  );

CREATE POLICY "Users can update action items they created"
  ON public.meeting_action_items
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete action items they created"
  ON public.meeting_action_items
  FOR DELETE
  USING (created_by = auth.uid());

-- 12. RLS Policies for meeting_sync_audit
CREATE POLICY "Users can view own sync audit"
  ON public.meeting_sync_audit
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sync audit"
  ON public.meeting_sync_audit
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 13. Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meetings_updated_at();

CREATE TRIGGER update_meeting_notes_updated_at
  BEFORE UPDATE ON public.meeting_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meetings_updated_at();

CREATE TRIGGER update_meeting_action_items_updated_at
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meetings_updated_at();

-- 14. Create a secure view for meetings with redaction for shared access
CREATE OR REPLACE VIEW public.meetings_shared WITH (security_invoker = true) AS
SELECT 
  m.id,
  m.tenant_id,
  m.owner_user_uuid,
  m.starts_at,
  m.ends_at,
  m.timezone,
  m.is_online,
  m.status,
  m.external_meeting_url,
  m.provider,
  m.is_organizer,
  m.time_draft_created,
  m.created_at,
  m.updated_at,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN m.title
    WHEN cs.scope = 'details' THEN m.title
    ELSE 'Busy'
  END as title,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN m.location
    WHEN cs.scope = 'details' THEN m.location
    ELSE NULL
  END as location,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN m.client_id
    WHEN cs.scope = 'details' THEN m.client_id
    ELSE NULL
  END as client_id,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN m.package_id
    WHEN cs.scope = 'details' THEN m.package_id
    ELSE NULL
  END as package_id,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN m.needs_linking
    ELSE false
  END as needs_linking,
  CASE 
    WHEN m.owner_user_uuid = auth.uid() THEN 'owner'
    WHEN cs.scope IS NOT NULL THEN cs.scope
    ELSE 'none'
  END as access_scope
FROM public.meetings m
LEFT JOIN public.calendar_shares cs 
  ON cs.owner_user_uuid = m.owner_user_uuid 
  AND cs.viewer_user_uuid = auth.uid()
WHERE m.owner_user_uuid = auth.uid() 
   OR cs.viewer_user_uuid IS NOT NULL;