-- =====================================================
-- EOS Quarterly Conversations (QC) Module - Database Schema
-- =====================================================

-- Create feature flag enum extension
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feature_flag') THEN
    CREATE TYPE feature_flag AS ENUM ('eos_qc');
  END IF;
END $$;

-- =====================================================
-- 1. TEMPLATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb, -- Ordered array of sections with prompts
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. QUARTERLY CONVERSATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_ids UUID[] NOT NULL, -- Array of manager user IDs
  template_id UUID REFERENCES public.eos_qc_templates(id) ON DELETE SET NULL,
  quarter_start DATE NOT NULL,
  quarter_end DATE NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'hr_only')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qc_quarter_dates CHECK (quarter_end > quarter_start)
);

-- =====================================================
-- 3. QC ANSWERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(qc_id, section_key, prompt_key)
);

-- =====================================================
-- 4. GWC & SEAT FIT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_fit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE UNIQUE,
  gets_it BOOLEAN,
  wants_it BOOLEAN,
  capacity BOOLEAN,
  notes TEXT,
  seat_id UUID REFERENCES public.eos_accountability_chart(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 5. QC LINKS TABLE (to rocks, issues, todos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE,
  linked_type TEXT NOT NULL CHECK (linked_type IN ('rock', 'issue', 'todo')),
  linked_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- 6. QC SIGNOFFS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE,
  signed_by UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('manager', 'reviewee')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(qc_id, signed_by, role)
);

-- =====================================================
-- 7. QC ATTACHMENTS TABLE (PDFs, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eos_qc_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_id UUID NOT NULL REFERENCES public.eos_qc(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_eos_qc_templates_tenant ON public.eos_qc_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eos_qc_tenant_reviewee ON public.eos_qc(tenant_id, reviewee_id);
CREATE INDEX IF NOT EXISTS idx_eos_qc_status ON public.eos_qc(status);
CREATE INDEX IF NOT EXISTS idx_eos_qc_quarter ON public.eos_qc(quarter_start, quarter_end);
CREATE INDEX IF NOT EXISTS idx_eos_qc_answers_qc ON public.eos_qc_answers(qc_id, section_key, prompt_key);
CREATE INDEX IF NOT EXISTS idx_eos_qc_links_qc ON public.eos_qc_links(qc_id, linked_type);
CREATE INDEX IF NOT EXISTS idx_eos_qc_signoffs_qc ON public.eos_qc_signoffs(qc_id);

-- =====================================================
-- ENABLE RLS
-- =====================================================
ALTER TABLE public.eos_qc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc_fit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_qc_attachments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Check if user can access a QC (reviewee, manager, HR/Admin, or SuperAdmin)
CREATE OR REPLACE FUNCTION public.can_access_qc(_user_id UUID, _qc_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qc RECORD;
  v_user_role TEXT;
BEGIN
  -- Get QC details
  SELECT reviewee_id, manager_ids, tenant_id INTO v_qc
  FROM public.eos_qc
  WHERE id = _qc_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if user is reviewee or manager
  IF v_qc.reviewee_id = _user_id OR _user_id = ANY(v_qc.manager_ids) THEN
    RETURN true;
  END IF;
  
  -- Check if user is SuperAdmin
  IF is_super_admin() THEN
    RETURN true;
  END IF;
  
  -- Check if user is Admin or HR in same tenant
  SELECT unicorn_role INTO v_user_role
  FROM public.users
  WHERE user_uuid = _user_id AND tenant_id = v_qc.tenant_id;
  
  IF v_user_role IN ('Admin', 'Super Admin') THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Check if QC is signed off by both parties
CREATE OR REPLACE FUNCTION public.is_qc_signed(_qc_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*) >= 2
  FROM public.eos_qc_signoffs
  WHERE qc_id = _qc_id;
$$;

-- =====================================================
-- RLS POLICIES - QC TEMPLATES
-- =====================================================
CREATE POLICY "qc_templates_select"
  ON public.eos_qc_templates FOR SELECT
  USING (tenant_id = get_current_user_tenant() OR is_super_admin());

CREATE POLICY "qc_templates_insert"
  ON public.eos_qc_templates FOR INSERT
  WITH CHECK (
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
    OR is_super_admin()
  );

CREATE POLICY "qc_templates_update"
  ON public.eos_qc_templates FOR UPDATE
  USING (
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
    OR is_super_admin()
  );

CREATE POLICY "qc_templates_delete"
  ON public.eos_qc_templates FOR DELETE
  USING (
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
    OR is_super_admin()
  );

-- =====================================================
-- RLS POLICIES - QC MAIN TABLE
-- =====================================================
CREATE POLICY "qc_select"
  ON public.eos_qc FOR SELECT
  USING (can_access_qc(auth.uid(), id));

CREATE POLICY "qc_insert"
  ON public.eos_qc FOR INSERT
  WITH CHECK (
    tenant_id = get_current_user_tenant()
    AND (is_eos_admin(auth.uid(), tenant_id) OR auth.uid() = ANY(manager_ids))
  );

CREATE POLICY "qc_update"
  ON public.eos_qc FOR UPDATE
  USING (
    can_access_qc(auth.uid(), id)
    AND NOT is_qc_signed(id) -- Cannot edit after both parties sign
  );

CREATE POLICY "qc_delete"
  ON public.eos_qc FOR DELETE
  USING (
    (tenant_id = get_current_user_tenant() AND is_eos_admin(auth.uid(), tenant_id))
    OR is_super_admin()
  );

-- =====================================================
-- RLS POLICIES - QC ANSWERS
-- =====================================================
CREATE POLICY "qc_answers_select"
  ON public.eos_qc_answers FOR SELECT
  USING (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_answers_insert"
  ON public.eos_qc_answers FOR INSERT
  WITH CHECK (
    can_access_qc(auth.uid(), qc_id)
    AND NOT is_qc_signed(qc_id)
  );

CREATE POLICY "qc_answers_update"
  ON public.eos_qc_answers FOR UPDATE
  USING (
    can_access_qc(auth.uid(), qc_id)
    AND NOT is_qc_signed(qc_id)
  );

CREATE POLICY "qc_answers_delete"
  ON public.eos_qc_answers FOR DELETE
  USING (
    can_access_qc(auth.uid(), qc_id)
    AND NOT is_qc_signed(qc_id)
  );

-- =====================================================
-- RLS POLICIES - QC FIT
-- =====================================================
CREATE POLICY "qc_fit_select"
  ON public.eos_qc_fit FOR SELECT
  USING (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_fit_insert"
  ON public.eos_qc_fit FOR INSERT
  WITH CHECK (
    can_access_qc(auth.uid(), qc_id)
    AND NOT is_qc_signed(qc_id)
  );

CREATE POLICY "qc_fit_update"
  ON public.eos_qc_fit FOR UPDATE
  USING (
    can_access_qc(auth.uid(), qc_id)
    AND NOT is_qc_signed(qc_id)
  );

-- =====================================================
-- RLS POLICIES - QC LINKS
-- =====================================================
CREATE POLICY "qc_links_select"
  ON public.eos_qc_links FOR SELECT
  USING (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_links_insert"
  ON public.eos_qc_links FOR INSERT
  WITH CHECK (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_links_delete"
  ON public.eos_qc_links FOR DELETE
  USING (can_access_qc(auth.uid(), qc_id));

-- =====================================================
-- RLS POLICIES - QC SIGNOFFS
-- =====================================================
CREATE POLICY "qc_signoffs_select"
  ON public.eos_qc_signoffs FOR SELECT
  USING (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_signoffs_insert"
  ON public.eos_qc_signoffs FOR INSERT
  WITH CHECK (
    can_access_qc(auth.uid(), qc_id)
    AND signed_by = auth.uid()
  );

-- =====================================================
-- RLS POLICIES - QC ATTACHMENTS
-- =====================================================
CREATE POLICY "qc_attachments_select"
  ON public.eos_qc_attachments FOR SELECT
  USING (can_access_qc(auth.uid(), qc_id));

CREATE POLICY "qc_attachments_insert"
  ON public.eos_qc_attachments FOR INSERT
  WITH CHECK (can_access_qc(auth.uid(), qc_id));

-- =====================================================
-- AUDIT TRIGGERS
-- =====================================================
CREATE TRIGGER audit_qc_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_qc
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();

CREATE TRIGGER audit_qc_answers_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_qc_answers
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();

CREATE TRIGGER audit_qc_signoffs
  AFTER INSERT ON public.eos_qc_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.audit_eos_change();

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================
CREATE TRIGGER update_qc_templates_updated_at
  BEFORE UPDATE ON public.eos_qc_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qc_updated_at
  BEFORE UPDATE ON public.eos_qc
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qc_answers_updated_at
  BEFORE UPDATE ON public.eos_qc_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qc_fit_updated_at
  BEFORE UPDATE ON public.eos_qc_fit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SEED DEFAULT TEMPLATE
-- =====================================================
CREATE OR REPLACE FUNCTION public.seed_default_qc_template()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants
  LOOP
    INSERT INTO public.eos_qc_templates (
      tenant_id, name, description, sections, is_default
    ) VALUES (
      v_tenant.id,
      'EOS Quarterly Conversation',
      'Standard EOS one-on-one quarterly review template',
      '[
        {
          "key": "core_values",
          "title": "Core Values Assessment",
          "prompts": [
            {"key": "value_alignment", "label": "Rate alignment with each core value", "type": "rating", "scale": ["Rarely", "Sometimes", "Consistently"], "required": true},
            {"key": "value_notes", "label": "Notes and examples", "type": "textarea"}
          ]
        },
        {
          "key": "gwc",
          "title": "GWC (Get it, Want it, Capacity)",
          "prompts": [
            {"key": "gets_it", "label": "Gets it (Understands the role)", "type": "boolean", "required": true},
            {"key": "wants_it", "label": "Wants it (Passionate about the work)", "type": "boolean", "required": true},
            {"key": "capacity", "label": "Capacity (Has time and capability)", "type": "boolean", "required": true},
            {"key": "gwc_notes", "label": "GWC Discussion Notes", "type": "textarea"}
          ]
        },
        {
          "key": "seat_expectations",
          "title": "Seat Expectations & Roles",
          "prompts": [
            {"key": "expectations_met", "label": "Meeting seat expectations?", "type": "rating", "scale": ["Needs Work", "Meets", "Exceeds"], "required": true},
            {"key": "expectations_notes", "label": "Discussion notes", "type": "textarea"}
          ]
        },
        {
          "key": "rocks_review",
          "title": "Rocks Review",
          "prompts": [
            {"key": "rocks_status", "label": "Review current quarter rocks", "type": "list"},
            {"key": "rocks_carry_over", "label": "Rocks to carry over", "type": "checklist"}
          ]
        },
        {
          "key": "kss",
          "title": "Keep / Start / Stop",
          "prompts": [
            {"key": "keep", "label": "Keep doing (What works well?)", "type": "list"},
            {"key": "start", "label": "Start doing (New opportunities?)", "type": "list"},
            {"key": "stop", "label": "Stop doing (What to eliminate?)", "type": "list"}
          ]
        },
        {
          "key": "wins",
          "title": "Wins & Headlines",
          "prompts": [
            {"key": "wins_list", "label": "Recent wins and achievements", "type": "list"},
            {"key": "headlines", "label": "Other headlines or updates", "type": "textarea"}
          ]
        },
        {
          "key": "issues",
          "title": "Issues for IDS",
          "prompts": [
            {"key": "issues_list", "label": "Issues to discuss or escalate", "type": "list"}
          ]
        },
        {
          "key": "development",
          "title": "Development Plan & Actions",
          "prompts": [
            {"key": "development_actions", "label": "Action items and development goals", "type": "list"},
            {"key": "next_quarter_focus", "label": "Focus areas for next quarter", "type": "textarea"}
          ]
        }
      ]'::jsonb,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Execute seeding
SELECT public.seed_default_qc_template();