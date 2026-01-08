-- Add processed tracking columns to calendar_events
ALTER TABLE public.calendar_events 
ADD COLUMN IF NOT EXISTS processed_users jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL;

-- Create user time capture settings table
CREATE TABLE IF NOT EXISTS public.user_time_capture_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  auto_create_meeting_drafts boolean NOT NULL DEFAULT true,
  min_minutes integer NOT NULL DEFAULT 10,
  max_minutes integer NOT NULL DEFAULT 240,
  include_organizer_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on tenant_id for performance
CREATE INDEX IF NOT EXISTS idx_user_time_capture_settings_tenant 
ON public.user_time_capture_settings(tenant_id);

-- Enable RLS
ALTER TABLE public.user_time_capture_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read/update their own settings
CREATE POLICY "Users can view own time capture settings"
ON public.user_time_capture_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time capture settings"
ON public.user_time_capture_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time capture settings"
ON public.user_time_capture_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- RLS: SuperAdmins can view all settings
CREATE POLICY "SuperAdmins can view all time capture settings"
ON public.user_time_capture_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.user_uuid = auth.uid() 
    AND users.role = 'super_admin'
  )
);

-- RLS: Tenant Admins can view tenant settings
CREATE POLICY "Tenant admins can view tenant time capture settings"
ON public.user_time_capture_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    JOIN public.users u ON u.user_uuid = tu.user_id
    WHERE tu.user_id = auth.uid()
    AND tu.tenant_id = user_time_capture_settings.tenant_id
    AND u.role = 'admin'
  )
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_user_time_capture_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_time_capture_settings_updated_at
BEFORE UPDATE ON public.user_time_capture_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_user_time_capture_settings_timestamp();

-- Create RPC function for manual worker run (admin only)
CREATE OR REPLACE FUNCTION public.rpc_run_time_draft_worker(p_tenant_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_events_processed int := 0;
  v_drafts_created int := 0;
  v_event record;
  v_user record;
  v_existing_draft uuid;
  v_user_settings record;
  v_duration_minutes int;
  v_attendee_emails text[];
  v_work_date date;
  v_new_draft_id uuid;
  v_processed_list jsonb;
BEGIN
  -- Check if caller is admin or super_admin
  SELECT role INTO v_user_role 
  FROM public.users 
  WHERE user_uuid = auth.uid();
  
  IF v_user_role NOT IN ('super_admin', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  -- Process ended events from the last 48 hours
  FOR v_event IN (
    SELECT ce.*
    FROM public.calendar_events ce
    WHERE ce.end_at <= now()
      AND ce.end_at >= now() - interval '48 hours'
      AND ce.status = 'confirmed'
      AND (p_tenant_id IS NULL OR ce.tenant_id = p_tenant_id)
    ORDER BY ce.end_at DESC
    LIMIT 500
  )
  LOOP
    v_events_processed := v_events_processed + 1;
    
    -- Calculate duration in minutes
    v_duration_minutes := EXTRACT(EPOCH FROM (v_event.end_at - v_event.start_at)) / 60;
    v_work_date := v_event.start_at::date;
    
    -- Extract attendee emails from JSON
    SELECT array_agg(attendee->>'email')
    INTO v_attendee_emails
    FROM jsonb_array_elements(v_event.attendees) attendee
    WHERE attendee->>'email' IS NOT NULL;

    -- Get current processed_users list
    v_processed_list := COALESCE(v_event.processed_users, '[]'::jsonb);

    -- Find eligible users for this event
    FOR v_user IN (
      SELECT DISTINCT u.user_uuid, u.email, utcs.min_minutes, utcs.max_minutes, utcs.include_organizer_only, utcs.auto_create_meeting_drafts
      FROM public.users u
      LEFT JOIN public.user_time_capture_settings utcs ON utcs.user_id = u.user_uuid
      WHERE u.tenant_id = v_event.tenant_id
        AND (
          -- User is organizer
          lower(u.email) = lower(v_event.organizer_email)
          OR (
            -- User is attendee (and setting allows non-organizers)
            u.email = ANY(v_attendee_emails)
            AND (utcs.include_organizer_only IS NULL OR utcs.include_organizer_only = false)
          )
        )
        -- Not already processed for this user
        AND NOT v_processed_list ? u.user_uuid::text
        -- Auto-create is enabled (default true if no settings)
        AND COALESCE(utcs.auto_create_meeting_drafts, true) = true
    )
    LOOP
      -- Check duration is within bounds
      IF v_duration_minutes < COALESCE(v_user.min_minutes, 10) 
         OR v_duration_minutes > COALESCE(v_user.max_minutes, 240) THEN
        CONTINUE;
      END IF;

      -- Check if draft already exists
      SELECT id INTO v_existing_draft
      FROM public.calendar_time_drafts
      WHERE tenant_id = v_event.tenant_id
        AND created_by = v_user.user_uuid
        AND calendar_event_id = v_event.id
        AND status IN ('draft', 'posted');
      
      IF v_existing_draft IS NOT NULL THEN
        -- Already has a draft, mark as processed
        v_processed_list := v_processed_list || to_jsonb(v_user.user_uuid::text);
        CONTINUE;
      END IF;

      -- Create the draft
      INSERT INTO public.calendar_time_drafts (
        tenant_id, created_by, calendar_event_id, 
        minutes, work_date, notes, 
        confidence, suggestion, status
      ) VALUES (
        v_event.tenant_id,
        v_user.user_uuid,
        v_event.id,
        ROUND(v_duration_minutes),
        v_work_date,
        'Meeting: ' || v_event.title,
        0.7, -- Default confidence for auto-created
        jsonb_build_object(
          'source', 'auto_worker',
          'event_title', v_event.title,
          'organizer', v_event.organizer_email,
          'created_at', now()
        ),
        'draft'
      )
      RETURNING id INTO v_new_draft_id;

      v_drafts_created := v_drafts_created + 1;
      
      -- Add user to processed list
      v_processed_list := v_processed_list || to_jsonb(v_user.user_uuid::text);
    END LOOP;

    -- Update event with new processed list
    UPDATE public.calendar_events
    SET processed_users = v_processed_list,
        processed_at = now()
    WHERE id = v_event.id;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'events_processed', v_events_processed,
    'drafts_created', v_drafts_created
  );
END;
$$;