-- EOS Stuck Alerts Table
-- Tracks proactive interventions based on EOS behavior

CREATE TABLE public.eos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN (
    'cadence_stuck', 
    'rock_stuck', 
    'ids_stuck', 
    'people_stuck', 
    'quarterly_stuck'
  )),
  severity text NOT NULL CHECK (severity IN ('informational', 'attention_required', 'intervention_required')),
  dimension text NOT NULL CHECK (dimension IN ('cadence', 'rocks', 'ids', 'people', 'quarterly')),
  source_entity_id uuid,
  source_entity_type text,
  message text NOT NULL,
  details jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'actioned', 'dismissed')),
  dismiss_reason text,
  dismissed_by uuid REFERENCES auth.users(id),
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_notified_at timestamptz DEFAULT now(),
  CONSTRAINT dismiss_reason_required CHECK (
    (status = 'dismissed' AND dismiss_reason IS NOT NULL) OR status != 'dismissed'
  )
);

-- Indexes for efficient queries
CREATE INDEX idx_eos_alerts_tenant_status ON public.eos_alerts(tenant_id, status);
CREATE INDEX idx_eos_alerts_tenant_created ON public.eos_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_eos_alerts_source ON public.eos_alerts(source_entity_id, source_entity_type);

-- Enable RLS
ALTER TABLE public.eos_alerts ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view their tenant's alerts
CREATE POLICY "Users can view their tenant alerts"
ON public.eos_alerts
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
);

-- Staff can view all alerts
CREATE POLICY "Staff can view all alerts"
ON public.eos_alerts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  )
);

-- Admin/Leaders can update alerts (acknowledge, dismiss)
CREATE POLICY "Admin and Leaders can update alerts"
ON public.eos_alerts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR tenant_role = 'Admin'
    )
  )
);

-- System can insert alerts
CREATE POLICY "Authenticated users can insert alerts"
ON public.eos_alerts
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);

-- Audit trigger for alert state changes
CREATE OR REPLACE FUNCTION public.audit_eos_alert_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_eos_events (
    tenant_id,
    entity,
    entity_id,
    action,
    user_id,
    details
  ) VALUES (
    NEW.tenant_id,
    'eos_alert',
    NEW.id::text,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'alert_created'
      WHEN OLD.status != NEW.status AND NEW.status = 'acknowledged' THEN 'alert_acknowledged'
      WHEN OLD.status != NEW.status AND NEW.status = 'dismissed' THEN 'alert_dismissed'
      WHEN OLD.status != NEW.status AND NEW.status = 'actioned' THEN 'alert_actioned'
      WHEN NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN 'alert_resolved'
      ELSE 'alert_updated'
    END,
    auth.uid(),
    jsonb_build_object(
      'alert_type', NEW.alert_type,
      'severity', NEW.severity,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', NEW.status,
      'dismiss_reason', NEW.dismiss_reason
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_audit_eos_alert
AFTER INSERT OR UPDATE ON public.eos_alerts
FOR EACH ROW
EXECUTE FUNCTION public.audit_eos_alert_change();