
-- Risk Items table for Risk Radar v1
-- Stores detected risks (rule-based or AI-assisted) per tenant/package/phase
CREATE TABLE public.risk_items (
  risk_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  package_id bigint NULL,
  phase_id bigint NULL,
  risk_code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  detected_by text NOT NULL DEFAULT 'rule',
  explanation_text text NULL,
  suggested_action text NULL,
  ai_event_id uuid NULL REFERENCES public.ai_events(ai_event_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  resolved_by_user_id uuid NULL,
  resolved_reason text NULL,
  dismissed_reason text NULL
);

-- Validation trigger for severity
CREATE OR REPLACE FUNCTION public.validate_risk_item_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'Invalid severity: %. Must be low, medium, or high', NEW.severity;
  END IF;
  IF NEW.status NOT IN ('open', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be open, resolved, or dismissed', NEW.status;
  END IF;
  IF NEW.detected_by NOT IN ('rule', 'ai_assist') THEN
    RAISE EXCEPTION 'Invalid detected_by: %. Must be rule or ai_assist', NEW.detected_by;
  END IF;
  -- Auto-set resolved_at when status changes to resolved or dismissed
  IF NEW.status IN ('resolved', 'dismissed') AND OLD.status = 'open' THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_risk_item_fields
  BEFORE INSERT OR UPDATE ON public.risk_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_item_fields();

-- Enable RLS
ALTER TABLE public.risk_items ENABLE ROW LEVEL SECURITY;

-- Vivacity staff can see and manage all risk items
CREATE POLICY "Vivacity staff can read all risk_items"
  ON public.risk_items
  FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "Vivacity staff can insert risk_items"
  ON public.risk_items
  FOR INSERT
  WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "Vivacity staff can update risk_items"
  ON public.risk_items
  FOR UPDATE
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- Tenant members can read their own risks (read-only for clients)
CREATE POLICY "Tenant members can read own risk_items"
  ON public.risk_items
  FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

-- Indexes for common queries
CREATE INDEX idx_risk_items_tenant_status ON public.risk_items (tenant_id, status);
CREATE INDEX idx_risk_items_phase ON public.risk_items (phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX idx_risk_items_package ON public.risk_items (package_id) WHERE package_id IS NOT NULL;

COMMENT ON TABLE public.risk_items IS 'Risk Radar v1: Stores detected compliance risks per tenant/package/phase. Rules-first detection with optional AI explanations.';
