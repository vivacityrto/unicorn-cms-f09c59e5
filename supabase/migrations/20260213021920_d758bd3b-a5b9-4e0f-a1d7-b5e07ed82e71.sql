
-- ============================================================
-- CEO Executive Dashboard – Missing Tables
-- ============================================================

-- 1. Add 'tier' column to tenants for Diamond client classification
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tier text DEFAULT 'standard';
COMMENT ON COLUMN public.tenants.tier IS 'Client tier classification: standard, gold, diamond';

-- 2. Financial Controls table
CREATE TABLE public.financial_controls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  control_type text NOT NULL, -- 'xero_reconciliation', 'payroll', 'outstanding_balance'
  status text NOT NULL DEFAULT 'pending', -- 'ok', 'pending', 'overdue', 'flagged'
  due_date date,
  completed_at timestamptz,
  amount_outstanding numeric(12,2) DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_controls_select_vivacity" ON public.financial_controls
  FOR SELECT USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "financial_controls_insert_superadmin" ON public.financial_controls
  FOR INSERT WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "financial_controls_update_superadmin" ON public.financial_controls
  FOR UPDATE USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "financial_controls_delete_superadmin" ON public.financial_controls
  FOR DELETE USING (public.is_super_admin_safe(auth.uid()));

-- 3. Client Commitments table
CREATE TABLE public.client_commitments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'met', 'missed', 'at_risk'
  impact_level text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  assigned_to uuid,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_commitments_select_vivacity" ON public.client_commitments
  FOR SELECT USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "client_commitments_insert_vivacity" ON public.client_commitments
  FOR INSERT WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "client_commitments_update_vivacity" ON public.client_commitments
  FOR UPDATE USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "client_commitments_delete_superadmin" ON public.client_commitments
  FOR DELETE USING (public.is_super_admin_safe(auth.uid()));

-- 4. CEO Decision Queue table
CREATE TABLE public.ceo_decision_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  description text,
  impact_level text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  recommended_option text,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'decided', 'deferred'
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ceo_decision_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceo_decision_queue_select_vivacity" ON public.ceo_decision_queue
  FOR SELECT USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "ceo_decision_queue_insert_vivacity" ON public.ceo_decision_queue
  FOR INSERT WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "ceo_decision_queue_update_superadmin" ON public.ceo_decision_queue
  FOR UPDATE USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "ceo_decision_queue_delete_superadmin" ON public.ceo_decision_queue
  FOR DELETE USING (public.is_super_admin_safe(auth.uid()));

-- 5. Triggers for updated_at
CREATE TRIGGER update_financial_controls_updated_at
  BEFORE UPDATE ON public.financial_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_commitments_updated_at
  BEFORE UPDATE ON public.client_commitments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ceo_decision_queue_updated_at
  BEFORE UPDATE ON public.ceo_decision_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
