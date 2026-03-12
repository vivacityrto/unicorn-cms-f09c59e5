-- 1. Create dd_ai_analysis_status
CREATE TABLE public.dd_ai_analysis_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.dd_ai_analysis_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_ai_analysis_status"
  ON public.dd_ai_analysis_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "SuperAdmins can manage dd_ai_analysis_status"
  ON public.dd_ai_analysis_status FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

INSERT INTO public.dd_ai_analysis_status (value, label, sort_order) VALUES
  ('pending', 'Pending', 1),
  ('analyzing', 'Analyzing', 2),
  ('completed', 'Completed', 3),
  ('failed', 'Failed', 4),
  ('skipped', 'Skipped', 5);

-- 2. Create dd_ai_status
CREATE TABLE public.dd_ai_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.dd_ai_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_ai_status"
  ON public.dd_ai_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "SuperAdmins can manage dd_ai_status"
  ON public.dd_ai_status FOR ALL TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

INSERT INTO public.dd_ai_status (value, label, sort_order) VALUES
  ('pending', 'Pending', 1),
  ('auto_approved', 'Auto Approved', 2),
  ('needs_review', 'Needs Review', 3),
  ('rejected', 'Rejected', 4);

-- 3. Add RTO fallback to dd_governance_framework
INSERT INTO public.dd_governance_framework (value, label, sort_order)
VALUES ('RTO', 'RTO (Unspecified Version)', 0)
ON CONFLICT (value) DO NOTHING;

-- 4. Drop CHECK constraints
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS chk_document_status;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_framework_type_check;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_ai_analysis_status_check;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_ai_status_check;

-- 5. Create validation trigger function
CREATE OR REPLACE FUNCTION public.trg_validate_documents_lookup_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate document_status (required)
  IF NOT EXISTS (
    SELECT 1 FROM public.dd_document_status
    WHERE value = NEW.document_status AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid document_status: %. Must match an active value in dd_document_status.', NEW.document_status;
  END IF;

  -- Validate framework_type (nullable)
  IF NEW.framework_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dd_governance_framework
    WHERE value = NEW.framework_type AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid framework_type: %. Must match an active value in dd_governance_framework.', NEW.framework_type;
  END IF;

  -- Validate ai_analysis_status (nullable)
  IF NEW.ai_analysis_status IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dd_ai_analysis_status
    WHERE value = NEW.ai_analysis_status AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid ai_analysis_status: %. Must match an active value in dd_ai_analysis_status.', NEW.ai_analysis_status;
  END IF;

  -- Validate ai_status (nullable)
  IF NEW.ai_status IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dd_ai_status
    WHERE value = NEW.ai_status AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid ai_status: %. Must match an active value in dd_ai_status.', NEW.ai_status;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Attach trigger
CREATE TRIGGER validate_documents_lookup_fields
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_documents_lookup_fields();