-- ROLLBACK:
-- ALTER TABLE public.client_audits
--   DROP CONSTRAINT client_audits_audit_type_fkey;
-- ALTER TABLE public.client_audits
--   ADD CONSTRAINT client_audits_audit_type_check
--   CHECK (audit_type = ANY (ARRAY[
--     'compliance_health_check','cricos_chc','rto_cricos_chc',
--     'mock_audit','cricos_mock_audit',
--     'due_diligence','due_diligence_combined'
--   ]));
-- DROP TABLE public.dd_audit_type;

-- Step 1 — Safety check: fail fast if any orphan rows exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.client_audits
    WHERE audit_type NOT IN (
      'compliance_health_check','cricos_chc','rto_cricos_chc',
      'mock_audit','cricos_mock_audit',
      'due_diligence','due_diligence_combined'
    )
  ) THEN
    RAISE EXCEPTION 'Orphan audit_type rows found — migration aborted';
  END IF;
END $$;

-- Step 2 — Create the lookup table
CREATE TABLE public.dd_audit_type (
  code        serial PRIMARY KEY,
  value       text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

-- Step 3 — Seed 7 rows
INSERT INTO public.dd_audit_type (value, label, sort_order) VALUES
  ('compliance_health_check',  'CHC — RTO',                           1),
  ('cricos_chc',               'CHC — CRICOS',                        2),
  ('rto_cricos_chc',           'CHC — RTO + CRICOS',                  3),
  ('mock_audit',               'Mock Audit',                          4),
  ('cricos_mock_audit',        'Mock Audit — CRICOS',                 5),
  ('due_diligence',            'Due Diligence',                       6),
  ('due_diligence_combined',   'Combined RTO + CRICOS Due Diligence', 7);

-- Step 4 — RLS (matches dd_priority pattern)
ALTER TABLE public.dd_audit_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_audit_type"
  ON public.dd_audit_type
  FOR SELECT TO authenticated USING (true);

-- Step 5 — Drop CHECK constraint and replace with FK
ALTER TABLE public.client_audits
  DROP CONSTRAINT client_audits_audit_type_check;

ALTER TABLE public.client_audits
  ADD CONSTRAINT client_audits_audit_type_fkey
  FOREIGN KEY (audit_type)
  REFERENCES public.dd_audit_type(value);
