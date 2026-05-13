-- Create dd_feature_flag lookup table (mirrors dd_accounting_system shape exactly)
CREATE TABLE IF NOT EXISTS public.dd_feature_flag (
  id          serial PRIMARY KEY,
  value       text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dd_feature_flag ENABLE ROW LEVEL SECURITY;

-- Read policy: open to all (matches dd_accounting_system)
CREATE POLICY dd_feature_flag_read
  ON public.dd_feature_flag
  FOR SELECT
  USING (true);

-- Admin policy: Super Admin only (matches dd_accounting_system)
CREATE POLICY dd_feature_flag_admin
  ON public.dd_feature_flag
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_uuid = auth.uid()
      AND users.unicorn_role = 'Super Admin'::unicorn_role
  ));

-- Seed: byte-identical to legacy enum value
INSERT INTO public.dd_feature_flag (value, label, sort_order, is_active)
VALUES ('eos_qc', 'EOS QC', 1, true)
ON CONFLICT (value) DO NOTHING;

-- Legacy public.feature_flag enum is intentionally retained for rollback safety.

-- ROLLBACK: DROP TABLE public.dd_feature_flag;