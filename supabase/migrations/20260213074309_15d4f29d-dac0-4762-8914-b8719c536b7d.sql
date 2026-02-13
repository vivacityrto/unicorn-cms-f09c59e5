
-- Phase Requirements config table
-- Defines what docs/fields are required per framework + phase
CREATE TABLE public.phase_requirements (
  phase_requirement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL,
  framework text NOT NULL,
  phase_key text NOT NULL,
  required_doc_types text[] NOT NULL DEFAULT '{}',
  required_fields jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for framework values
CREATE OR REPLACE FUNCTION public.validate_phase_requirement_framework()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.framework NOT IN ('rto_2015', 'rto_2025', 'cricos') THEN
    RAISE EXCEPTION 'Invalid framework: %. Must be rto_2015, rto_2025, or cricos', NEW.framework;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_phase_requirement_framework
  BEFORE INSERT OR UPDATE ON public.phase_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_phase_requirement_framework();

-- Enable RLS
ALTER TABLE public.phase_requirements ENABLE ROW LEVEL SECURITY;

-- Global read for all authenticated users (lookup table)
CREATE POLICY "Authenticated users can read phase_requirements"
  ON public.phase_requirements
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only SuperAdmins can manage requirements
CREATE POLICY "SuperAdmins can insert phase_requirements"
  ON public.phase_requirements
  FOR INSERT
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "SuperAdmins can update phase_requirements"
  ON public.phase_requirements
  FOR UPDATE
  USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "SuperAdmins can delete phase_requirements"
  ON public.phase_requirements
  FOR DELETE
  USING (public.is_super_admin_safe(auth.uid()));

-- Index for lookups
CREATE INDEX idx_phase_requirements_framework_key 
  ON public.phase_requirements (framework, phase_key);

COMMENT ON TABLE public.phase_requirements IS 'Config table defining required documents and fields per compliance framework and phase. Used by the phase completeness checker.';
