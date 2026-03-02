
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS stage_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS stage_type text DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_certified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certified_notes text,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS requires_stage_keys text[],
  ADD COLUMN IF NOT EXISTS frameworks text[],
  ADD COLUMN IF NOT EXISTS covers_standards text[],
  ADD COLUMN IF NOT EXISTS registry_code text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz,
  ADD COLUMN IF NOT EXISTS dashboard_visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_reusable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_hint text;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_stages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_stages_updated_at
  BEFORE UPDATE ON public.stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stages_updated_at();
