-- SET SEARCH PATH
SET search_path = public, pg_temp;

-- ===================================
-- AUDIT CORE TABLES
-- ===================================

-- Main audit table
CREATE TABLE IF NOT EXISTS public.audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete')),
  audit_title TEXT NOT NULL DEFAULT 'Compliance Health Check – SRTOs 2025',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit sections (Quality Areas 1-8)
CREATE TABLE IF NOT EXISTS public.audit_section (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  standard_code TEXT NOT NULL,
  title TEXT NOT NULL,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Question bank (versioned, reusable)
CREATE TABLE IF NOT EXISTS public.audit_question_bank (
  id BIGSERIAL PRIMARY KEY,
  standard_code TEXT NOT NULL,
  quality_area TEXT NOT NULL,
  performance_indicator TEXT NOT NULL,
  question_text TEXT NOT NULL,
  rating_scale JSONB NOT NULL DEFAULT '["compliant", "minor_issue", "major_risk", "not_applicable"]'::jsonb,
  evidence_prompt TEXT NOT NULL,
  risk_tags TEXT[] NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(standard_code, question_text, version)
);

-- Audit questions (instantiated for specific audit)
CREATE TABLE IF NOT EXISTS public.audit_question (
  id BIGSERIAL PRIMARY KEY,
  audit_section_id BIGINT NOT NULL REFERENCES public.audit_section(id) ON DELETE CASCADE,
  bank_id BIGINT NOT NULL REFERENCES public.audit_question_bank(id) ON DELETE RESTRICT,
  question_text TEXT NOT NULL,
  rating_scale JSONB NOT NULL,
  evidence_prompt TEXT NOT NULL,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit responses (ratings and evidence)
CREATE TABLE IF NOT EXISTS public.audit_response (
  id BIGSERIAL PRIMARY KEY,
  audit_question_id BIGINT NOT NULL REFERENCES public.audit_question(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('compliant', 'partially_compliant', 'non_compliant', 'not_applicable')),
  notes TEXT,
  risk_level TEXT NOT NULL DEFAULT 'none' CHECK (risk_level IN ('high', 'medium', 'low', 'none')),
  tags TEXT[] DEFAULT '{}',
  evidence_files TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(audit_question_id)
);

-- Audit findings (auto-generated and manual)
CREATE TABLE IF NOT EXISTS public.audit_finding (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES public.audit_question(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  impact TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  auto_generated BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit actions (tasks linked to findings)
CREATE TABLE IF NOT EXISTS public.audit_action (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES public.audit(id) ON DELETE CASCADE,
  finding_id BIGINT REFERENCES public.audit_finding(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  description TEXT NOT NULL,
  task_id UUID,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================================
-- INDEXES
-- ===================================

CREATE INDEX idx_audit_tenant_id ON public.audit(tenant_id);
CREATE INDEX idx_audit_client_id ON public.audit(client_id);
CREATE INDEX idx_audit_status ON public.audit(status);
CREATE INDEX idx_audit_section_audit_id ON public.audit_section(audit_id);
CREATE INDEX idx_audit_question_bank_standard_code ON public.audit_question_bank(standard_code);
CREATE INDEX idx_audit_question_bank_active ON public.audit_question_bank(active);
CREATE INDEX idx_audit_question_section_id ON public.audit_question(audit_section_id);
CREATE INDEX idx_audit_response_question_id ON public.audit_response(audit_question_id);
CREATE INDEX idx_audit_finding_audit_id ON public.audit_finding(audit_id);
CREATE INDEX idx_audit_action_audit_id ON public.audit_action(audit_id);
CREATE INDEX idx_audit_action_assigned_to ON public.audit_action(assigned_to);

-- ===================================
-- UPDATED_AT TRIGGERS
-- ===================================

CREATE TRIGGER trg_audit_updated_at BEFORE UPDATE ON public.audit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_question_bank_updated_at BEFORE UPDATE ON public.audit_question_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_response_updated_at BEFORE UPDATE ON public.audit_response
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_finding_updated_at BEFORE UPDATE ON public.audit_finding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_action_updated_at BEFORE UPDATE ON public.audit_action
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================
-- ENABLE RLS
-- ===================================

ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_action ENABLE ROW LEVEL SECURITY;

-- ===================================
-- GRANT PERMISSIONS
-- ===================================

GRANT ALL ON public.audit TO authenticated;
GRANT ALL ON public.audit_section TO authenticated;
GRANT ALL ON public.audit_question_bank TO authenticated;
GRANT ALL ON public.audit_question TO authenticated;
GRANT ALL ON public.audit_response TO authenticated;
GRANT ALL ON public.audit_finding TO authenticated;
GRANT ALL ON public.audit_action TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
