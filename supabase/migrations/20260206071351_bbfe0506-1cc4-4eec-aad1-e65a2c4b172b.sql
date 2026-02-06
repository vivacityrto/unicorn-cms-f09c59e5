-- Teams Notifications Integration Tables (without feature flags)

-- Create event type enum
CREATE TYPE public.notification_event_type AS ENUM (
  'task_assigned',
  'task_overdue',
  'risk_flagged',
  'package_threshold_80',
  'package_threshold_95',
  'package_threshold_100',
  'meeting_action_created'
);

-- Create delivery target enum
CREATE TYPE public.notification_delivery_target AS ENUM ('dm', 'channel');

-- Create notification status enum
CREATE TYPE public.notification_status AS ENUM ('queued', 'sent', 'failed', 'skipped');

-- Create integration status enum
CREATE TYPE public.notification_integration_status AS ENUM ('connected', 'disconnected', 'error');

-- User notification integrations (per-user Teams connection)
CREATE TABLE public.user_notification_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'microsoft_teams',
  status public.notification_integration_status NOT NULL DEFAULT 'disconnected',
  ms_user_id TEXT NULL,
  preferred_channel_id TEXT NULL,
  preferred_team_id TEXT NULL,
  webhook_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_provider UNIQUE (user_uuid, provider)
);

-- Notification rules per user per event type
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid UUID NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  event_type public.notification_event_type NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_target public.notification_delivery_target NOT NULL DEFAULT 'dm',
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_event UNIQUE (user_uuid, event_type)
);

-- Notification outbox for queued messages
CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.notification_event_type NOT NULL,
  tenant_id INTEGER NULL REFERENCES public.tenants(id),
  client_id INTEGER NULL,
  record_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  recipient_user_uuid UUID NOT NULL REFERENCES public.users(user_uuid),
  payload JSONB NOT NULL DEFAULT '{}',
  status public.notification_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NULL,
  next_retry_at TIMESTAMPTZ NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_notification_outbox_status ON public.notification_outbox(status) WHERE status = 'queued';
CREATE INDEX idx_notification_outbox_recipient ON public.notification_outbox(recipient_user_uuid);
CREATE INDEX idx_notification_outbox_next_retry ON public.notification_outbox(next_retry_at) WHERE status = 'queued';
CREATE INDEX idx_notification_rules_user ON public.notification_rules(user_uuid);
CREATE INDEX idx_user_notification_integrations_user ON public.user_notification_integrations(user_uuid);

-- Enable RLS
ALTER TABLE public.user_notification_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_notification_integrations
CREATE POLICY "Users can view own integrations"
  ON public.user_notification_integrations
  FOR SELECT
  USING (user_uuid = auth.uid());

CREATE POLICY "Users can manage own integrations"
  ON public.user_notification_integrations
  FOR ALL
  USING (user_uuid = auth.uid());

CREATE POLICY "SuperAdmins can view all integrations"
  ON public.user_notification_integrations
  FOR SELECT
  USING (public.is_vivacity_team_user(auth.uid()));

-- RLS Policies for notification_rules
CREATE POLICY "Users can view own rules"
  ON public.notification_rules
  FOR SELECT
  USING (user_uuid = auth.uid());

CREATE POLICY "Users can manage own rules"
  ON public.notification_rules
  FOR ALL
  USING (user_uuid = auth.uid());

CREATE POLICY "SuperAdmins can view all rules"
  ON public.notification_rules
  FOR SELECT
  USING (public.is_vivacity_team_user(auth.uid()));

-- RLS Policies for notification_outbox (restricted to service role / SuperAdmin)
CREATE POLICY "SuperAdmins can view outbox"
  ON public.notification_outbox
  FOR SELECT
  USING (public.is_vivacity_team_user(auth.uid()));

CREATE POLICY "Users can view own notifications"
  ON public.notification_outbox
  FOR SELECT
  USING (recipient_user_uuid = auth.uid());

-- Function to emit a notification to the outbox
CREATE OR REPLACE FUNCTION public.emit_notification(
  p_event_type public.notification_event_type,
  p_recipient_user_uuid UUID,
  p_record_type TEXT,
  p_record_id UUID,
  p_payload JSONB,
  p_tenant_id INTEGER DEFAULT NULL,
  p_client_id INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_rule_enabled BOOLEAN;
BEGIN
  -- Check if user has this notification type enabled
  SELECT is_enabled INTO v_rule_enabled
  FROM public.notification_rules
  WHERE user_uuid = p_recipient_user_uuid
    AND event_type = p_event_type;
  
  -- Default to enabled if no rule exists
  IF v_rule_enabled IS NULL THEN
    v_rule_enabled := true;
  END IF;
  
  -- Only queue if enabled
  IF v_rule_enabled THEN
    INSERT INTO public.notification_outbox (
      event_type,
      tenant_id,
      client_id,
      record_type,
      record_id,
      recipient_user_uuid,
      payload,
      status
    ) VALUES (
      p_event_type,
      p_tenant_id,
      p_client_id,
      p_record_type,
      p_record_id,
      p_recipient_user_uuid,
      p_payload,
      'queued'
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Audit log for notification events
CREATE TABLE public.notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES public.notification_outbox(id),
  action TEXT NOT NULL,
  recipient_user_uuid UUID NOT NULL,
  event_type public.notification_event_type NOT NULL,
  record_type TEXT,
  record_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_audit_log_recipient ON public.notification_audit_log(recipient_user_uuid);
CREATE INDEX idx_notification_audit_log_created ON public.notification_audit_log(created_at DESC);

ALTER TABLE public.notification_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can view audit log"
  ON public.notification_audit_log
  FOR SELECT
  USING (public.is_vivacity_team_user(auth.uid()));

-- Update timestamp trigger
CREATE TRIGGER update_user_notification_integrations_updated_at
  BEFORE UPDATE ON public.user_notification_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();