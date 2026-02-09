-- Create ai_review_flags table for CSC handoff tracking
CREATE TABLE IF NOT EXISTS public.ai_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL,
  client_id integer NOT NULL,
  package_id integer NULL,
  phase_id integer NULL,
  ai_interaction_log_id uuid NOT NULL REFERENCES public.ai_interaction_logs(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  flagged_reason text NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  resolved_at timestamptz NULL,
  resolution_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_review_flags_tenant_id ON public.ai_review_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_review_flags_client_id ON public.ai_review_flags(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_review_flags_status ON public.ai_review_flags(status);
CREATE INDEX IF NOT EXISTS idx_ai_review_flags_flagged_by ON public.ai_review_flags(flagged_by);
CREATE INDEX IF NOT EXISTS idx_ai_review_flags_created_at ON public.ai_review_flags(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE public.ai_review_flags IS 'Tracks AI interactions flagged for CSC review by Vivacity internal users';

-- Enable Row Level Security
ALTER TABLE public.ai_review_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Vivacity internal users can select flags
CREATE POLICY "vivacity_internal_select_ai_flags"
ON public.ai_review_flags
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
);

-- RLS Policy: Vivacity internal users can insert flags
CREATE POLICY "vivacity_internal_insert_ai_flags"
ON public.ai_review_flags
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
);

-- RLS Policy: Vivacity internal users can update flags
CREATE POLICY "vivacity_internal_update_ai_flags"
ON public.ai_review_flags
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_ai_review_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ai_review_flags_updated_at
BEFORE UPDATE ON public.ai_review_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_ai_review_flags_updated_at();