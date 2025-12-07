-- Phase 6: Client Viewer, Notifications, Calendar

-- Create client_viewer enum value for eos_role if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eos_role') THEN
    CREATE TYPE eos_role AS ENUM ('admin', 'facilitator', 'member', 'client_viewer');
  ELSE
    ALTER TYPE eos_role ADD VALUE IF NOT EXISTS 'client_viewer';
  END IF;
END $$;

-- User notification preferences table
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  inapp_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification prefs
CREATE POLICY "Users can view their own notification prefs"
  ON public.user_notification_prefs FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "Users can update their own notification prefs"
  ON public.user_notification_prefs FOR UPDATE
  USING (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "Users can insert their own notification prefs"
  ON public.user_notification_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_super_admin());

-- Notification queue table
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  channel TEXT NOT NULL DEFAULT 'inapp',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (channel IN ('inapp', 'email', 'both')),
  CHECK (status IN ('pending', 'delivered', 'failed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification queue
CREATE POLICY "Users can view their own notifications"
  ON public.notification_queue FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "System can insert notifications"
  ON public.notification_queue FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "System can update notifications"
  ON public.notification_queue FOR UPDATE
  USING (is_super_admin());

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_status ON public.notification_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON public.notification_queue(scheduled_at) WHERE status = 'pending';

-- Add client_id to users table if not exists (for client_viewer role mapping)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN client_id UUID REFERENCES public.clients_legacy(id);
  END IF;
END $$;

-- Add recurrence fields to eos_meetings if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'eos_meetings' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE public.eos_meetings ADD COLUMN recurrence_rule TEXT DEFAULT NULL;
    ALTER TABLE public.eos_meetings ADD COLUMN recurrence_end_date DATE DEFAULT NULL;
    ALTER TABLE public.eos_meetings ADD COLUMN parent_meeting_id UUID REFERENCES public.eos_meetings(id);
  END IF;
END $$;

-- RPC: Get client EOS overview
CREATE OR REPLACE FUNCTION public.get_client_eos_overview(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_user_client_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get user's client_id and tenant_id
  SELECT client_id, tenant_id INTO v_user_client_id, v_tenant_id
  FROM public.users WHERE user_uuid = auth.uid();

  -- Verify access (must be same client or super admin)
  IF NOT (v_user_client_id = p_client_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Aggregate counts
  SELECT jsonb_build_object(
    'rocks', jsonb_build_object(
      'active', (SELECT COUNT(*) FROM public.eos_rocks WHERE client_id = p_client_id AND status != 'complete'),
      'complete', (SELECT COUNT(*) FROM public.eos_rocks WHERE client_id = p_client_id AND status = 'complete')
    ),
    'issues', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM public.eos_issues WHERE client_id = p_client_id AND status = 'Open'),
      'solved', (SELECT COUNT(*) FROM public.eos_issues WHERE client_id = p_client_id AND status = 'Solved')
    ),
    'headlines', (SELECT COUNT(*) FROM public.eos_headlines h
      INNER JOIN public.eos_meetings m ON m.id = h.meeting_id
      WHERE m.client_id = p_client_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- RPC: List meeting summaries for client
CREATE OR REPLACE FUNCTION public.list_meeting_summaries_for_client(
  p_client_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  meeting_id UUID,
  created_at TIMESTAMPTZ,
  meeting_title TEXT,
  meeting_date TIMESTAMPTZ,
  todos JSONB,
  issues JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_client_id UUID;
BEGIN
  -- Get user's client_id
  SELECT client_id INTO v_user_client_id
  FROM public.users WHERE user_uuid = auth.uid();

  -- Verify access
  IF NOT (v_user_client_id = p_client_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return summaries
  RETURN QUERY
  SELECT 
    s.id,
    s.meeting_id,
    s.created_at,
    m.title as meeting_title,
    m.scheduled_date as meeting_date,
    s.todos,
    s.issues
  FROM public.eos_meeting_summaries s
  INNER JOIN public.eos_meetings m ON m.id = s.meeting_id
  WHERE m.client_id = p_client_id
  ORDER BY m.scheduled_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- RPC: Set user notification preferences
CREATE OR REPLACE FUNCTION public.set_user_notification_prefs(p_prefs JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get user's tenant_id
  SELECT tenant_id INTO v_tenant_id
  FROM public.users WHERE user_uuid = auth.uid();

  -- Upsert preferences
  INSERT INTO public.user_notification_prefs (
    user_id,
    tenant_id,
    email_enabled,
    inapp_enabled,
    digest_enabled,
    quiet_hours
  ) VALUES (
    auth.uid(),
    v_tenant_id,
    COALESCE((p_prefs->>'email_enabled')::boolean, true),
    COALESCE((p_prefs->>'inapp_enabled')::boolean, true),
    COALESCE((p_prefs->>'digest_enabled')::boolean, false),
    p_prefs->'quiet_hours'
  )
  ON CONFLICT (user_id, tenant_id) 
  DO UPDATE SET
    email_enabled = COALESCE((p_prefs->>'email_enabled')::boolean, user_notification_prefs.email_enabled),
    inapp_enabled = COALESCE((p_prefs->>'inapp_enabled')::boolean, user_notification_prefs.inapp_enabled),
    digest_enabled = COALESCE((p_prefs->>'digest_enabled')::boolean, user_notification_prefs.digest_enabled),
    quiet_hours = COALESCE(p_prefs->'quiet_hours', user_notification_prefs.quiet_hours),
    updated_at = now()
  RETURNING id INTO v_pref_id;

  RETURN v_pref_id;
END;
$$;

-- RPC: Create recurring meetings
CREATE OR REPLACE FUNCTION public.create_recurring_meetings(
  p_base_meeting_id UUID,
  p_weeks_ahead INT DEFAULT 12
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_meeting RECORD;
  v_new_meeting_id UUID;
  v_meeting_ids UUID[] := '{}';
  v_week_offset INT;
  v_new_date TIMESTAMPTZ;
  v_participant RECORD;
  v_segment RECORD;
BEGIN
  -- Get base meeting
  SELECT * INTO v_base_meeting
  FROM public.eos_meetings
  WHERE id = p_base_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base meeting not found';
  END IF;

  -- Verify permissions
  IF NOT (
    is_super_admin() OR
    is_eos_admin(auth.uid(), v_base_meeting.tenant_id) OR
    has_meeting_role(auth.uid(), p_base_meeting_id, ARRAY['Leader'])
  ) THEN
    RAISE EXCEPTION 'Only facilitator or admin can create recurring meetings';
  END IF;

  -- Create meetings for each week
  FOR v_week_offset IN 1..p_weeks_ahead
  LOOP
    v_new_date := v_base_meeting.scheduled_date + (v_week_offset * INTERVAL '1 week');

    -- Create new meeting
    INSERT INTO public.eos_meetings (
      tenant_id,
      client_id,
      meeting_type,
      title,
      scheduled_date,
      duration_minutes,
      parent_meeting_id,
      recurrence_rule,
      created_by
    ) VALUES (
      v_base_meeting.tenant_id,
      v_base_meeting.client_id,
      v_base_meeting.meeting_type,
      v_base_meeting.title,
      v_new_date,
      v_base_meeting.duration_minutes,
      p_base_meeting_id,
      'FREQ=WEEKLY;INTERVAL=1',
      auth.uid()
    ) RETURNING id INTO v_new_meeting_id;

    v_meeting_ids := array_append(v_meeting_ids, v_new_meeting_id);

    -- Copy participants
    FOR v_participant IN
      SELECT * FROM public.eos_meeting_participants
      WHERE meeting_id = p_base_meeting_id
    LOOP
      INSERT INTO public.eos_meeting_participants (
        meeting_id, user_id, role, attended
      ) VALUES (
        v_new_meeting_id, v_participant.user_id, v_participant.role, false
      );
    END LOOP;

    -- Copy segments
    FOR v_segment IN
      SELECT * FROM public.eos_meeting_segments
      WHERE meeting_id = p_base_meeting_id
      ORDER BY sequence_order
    LOOP
      INSERT INTO public.eos_meeting_segments (
        meeting_id, segment_name, duration_minutes, sequence_order
      ) VALUES (
        v_new_meeting_id, v_segment.segment_name, 
        v_segment.duration_minutes, v_segment.sequence_order
      );
    END LOOP;
  END LOOP;

  RETURN v_meeting_ids;
END;
$$;

-- Update RLS policies for client_viewer role on existing EOS tables

-- eos_rocks: client viewers can only see their client's rocks
DROP POLICY IF EXISTS "client_viewers_select_rocks" ON public.eos_rocks;
CREATE POLICY "client_viewers_select_rocks"
  ON public.eos_rocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.client_id = eos_rocks.client_id
        AND has_eos_role(auth.uid(), eos_rocks.tenant_id, 'client_viewer'::eos_role)
    )
  );

-- eos_issues: client viewers can only see their client's issues
DROP POLICY IF EXISTS "client_viewers_select_issues" ON public.eos_issues;
CREATE POLICY "client_viewers_select_issues"
  ON public.eos_issues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.client_id = eos_issues.client_id
        AND has_eos_role(auth.uid(), eos_issues.tenant_id, 'client_viewer'::eos_role)
    )
  );

-- eos_headlines: client viewers can see headlines from meetings they're tagged in
DROP POLICY IF EXISTS "client_viewers_select_headlines" ON public.eos_headlines;
CREATE POLICY "client_viewers_select_headlines"
  ON public.eos_headlines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      INNER JOIN public.eos_meetings m ON m.client_id = u.client_id
      WHERE u.user_uuid = auth.uid()
        AND m.id = eos_headlines.meeting_id
        AND has_eos_role(auth.uid(), m.tenant_id, 'client_viewer'::eos_role)
    )
  );

-- eos_meeting_summaries: client viewers can see summaries for their client meetings
DROP POLICY IF EXISTS "client_viewers_select_summaries" ON public.eos_meeting_summaries;
CREATE POLICY "client_viewers_select_summaries"
  ON public.eos_meeting_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      INNER JOIN public.eos_meetings m ON m.client_id = u.client_id
      WHERE u.user_uuid = auth.uid()
        AND m.id = eos_meeting_summaries.meeting_id
        AND has_eos_role(auth.uid(), eos_meeting_summaries.tenant_id, 'client_viewer'::eos_role)
    )
  );

-- Audit trigger for notification prefs
CREATE TRIGGER audit_notification_prefs_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();