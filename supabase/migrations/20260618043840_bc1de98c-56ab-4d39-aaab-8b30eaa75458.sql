ALTER TABLE public.compliance_obligations
  ALTER COLUMN audience_id   SET NOT NULL,
  ALTER COLUMN recurrence_id SET NOT NULL;