-- Create dismissal table for Time Inbox banner
CREATE TABLE IF NOT EXISTS public.user_time_inbox_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  dismiss_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, dismiss_date)
);

-- Enable RLS
ALTER TABLE public.user_time_inbox_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS policies for dismissals
CREATE POLICY "Users can view own dismissals" ON public.user_time_inbox_dismissals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dismissals" ON public.user_time_inbox_dismissals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dismissals" ON public.user_time_inbox_dismissals
  FOR DELETE USING (auth.uid() = user_id);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_time_inbox_dismissals_user_date 
  ON public.user_time_inbox_dismissals(user_id, dismiss_date);

-- Function to snooze a draft until a specific date
CREATE OR REPLACE FUNCTION public.rpc_snooze_time_draft(
  p_draft_id uuid,
  p_until date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_draft record;
BEGIN
  -- Get the draft
  SELECT * INTO v_draft
  FROM public.calendar_time_drafts
  WHERE id = p_draft_id
    AND created_by = auth.uid()
    AND status = 'draft';

  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found or not editable');
  END IF;

  -- Update snooze date
  UPDATE public.calendar_time_drafts
  SET snoozed_until = p_until,
      updated_at = now()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object('success', true, 'snoozed_until', p_until);
END;
$$;

-- Function to bulk snooze drafts
CREATE OR REPLACE FUNCTION public.rpc_bulk_snooze_time_drafts(
  p_draft_ids uuid[],
  p_until date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snoozed_count int := 0;
BEGIN
  UPDATE public.calendar_time_drafts
  SET snoozed_until = p_until,
      updated_at = now()
  WHERE id = ANY(p_draft_ids)
    AND created_by = auth.uid()
    AND status = 'draft';
  
  GET DIAGNOSTICS v_snoozed_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'snoozed_count', v_snoozed_count);
END;
$$;

-- Function to dismiss Time Inbox banner for today
CREATE OR REPLACE FUNCTION public.rpc_dismiss_time_inbox_banner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
BEGIN
  -- Get user's tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE user_uuid = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User tenant not found');
  END IF;

  -- Insert dismissal (ignore if exists)
  INSERT INTO public.user_time_inbox_dismissals (tenant_id, user_id, dismiss_date)
  VALUES (v_tenant_id, auth.uid(), CURRENT_DATE)
  ON CONFLICT (tenant_id, user_id, dismiss_date) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'dismissed_until', CURRENT_DATE);
END;
$$;

-- Update stats function to account for snoozed and dismissed
CREATE OR REPLACE FUNCTION public.rpc_get_time_inbox_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_recent_count int := 0;
  v_overdue_count int := 0;
  v_total_drafts int := 0;
  v_is_dismissed boolean := false;
BEGIN
  -- Check if banner is dismissed for today
  SELECT EXISTS(
    SELECT 1 FROM public.user_time_inbox_dismissals
    WHERE user_id = v_user_id AND dismiss_date = CURRENT_DATE
  ) INTO v_is_dismissed;

  -- Count recent drafts (last 7 days, not snoozed)
  SELECT COUNT(*) INTO v_recent_count
  FROM public.calendar_time_drafts
  WHERE created_by = v_user_id
    AND status = 'draft'
    AND work_date >= CURRENT_DATE - interval '7 days'
    AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE);

  -- Count overdue drafts (>2 days old, not snoozed)
  SELECT COUNT(*) INTO v_overdue_count
  FROM public.calendar_time_drafts
  WHERE created_by = v_user_id
    AND status = 'draft'
    AND work_date < CURRENT_DATE - interval '2 days'
    AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE);

  -- Total drafts
  SELECT COUNT(*) INTO v_total_drafts
  FROM public.calendar_time_drafts
  WHERE created_by = v_user_id
    AND status = 'draft'
    AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE);

  RETURN jsonb_build_object(
    'recent_count', v_recent_count,
    'overdue_count', v_overdue_count,
    'total_drafts', v_total_drafts,
    'is_dismissed', v_is_dismissed
  );
END;
$$;

-- Update list drafts to support overdue filter and exclude snoozed
CREATE OR REPLACE FUNCTION public.rpc_list_time_drafts(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_overdue_only boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', d.id,
    'tenant_id', d.tenant_id,
    'created_by', d.created_by,
    'calendar_event_id', d.calendar_event_id,
    'client_id', d.client_id,
    'package_id', d.package_id,
    'stage_id', d.stage_id,
    'minutes', d.minutes,
    'work_date', d.work_date,
    'notes', d.notes,
    'confidence', d.confidence,
    'suggestion', d.suggestion,
    'status', d.status,
    'work_type', d.work_type,
    'is_billable', d.is_billable,
    'last_viewed_at', d.last_viewed_at,
    'snoozed_until', d.snoozed_until,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'event_title', e.title,
    'event_start_at', e.start_at,
    'event_end_at', e.end_at,
    'client_name', c.name,
    'suggested_client_id', d.suggested_client_id,
    'suggested_package_id', d.suggested_package_id,
    'match_confidence', d.match_confidence,
    'match_reason', d.match_reason,
    'suggested_client_name', sc.name,
    'suggested_package_name', sp.name
  )
  FROM public.calendar_time_drafts d
  LEFT JOIN public.calendar_events e ON e.id = d.calendar_event_id
  LEFT JOIN public.tenants c ON c.id = d.client_id
  LEFT JOIN public.tenants sc ON sc.id = d.suggested_client_id
  LEFT JOIN public.packages sp ON sp.id = d.suggested_package_id
  WHERE d.created_by = auth.uid()
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_from IS NULL OR d.work_date >= p_from)
    AND (p_to IS NULL OR d.work_date <= p_to)
    AND (d.snoozed_until IS NULL OR d.snoozed_until <= CURRENT_DATE)
    AND (p_overdue_only = false OR d.work_date < CURRENT_DATE - interval '2 days')
  ORDER BY d.work_date DESC, e.start_at DESC;
END;
$$;