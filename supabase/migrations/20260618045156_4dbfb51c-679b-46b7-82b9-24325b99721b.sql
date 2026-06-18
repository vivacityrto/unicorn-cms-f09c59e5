ALTER TABLE public.compliance_obligations
  DROP CONSTRAINT IF EXISTS compliance_obligations_audience_check,
  DROP CONSTRAINT IF EXISTS compliance_obligations_recurrence_check,
  DROP COLUMN audience,
  DROP COLUMN recurrence;