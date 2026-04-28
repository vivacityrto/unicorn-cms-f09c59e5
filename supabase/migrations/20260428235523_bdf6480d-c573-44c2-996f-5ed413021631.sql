-- =====================================================================
-- ROLLBACK (run only if no rows use 'due_diligence_combined'):
--
--   -- Safety check first:
--   -- SELECT id FROM public.client_audits
--   -- WHERE audit_type = 'due_diligence_combined';
--
--   ALTER TABLE public.client_audits
--     DROP CONSTRAINT client_audits_audit_type_check;
--
--   ALTER TABLE public.client_audits
--     ADD CONSTRAINT client_audits_audit_type_check
--     CHECK (audit_type = ANY (ARRAY[
--       'compliance_health_check','cricos_chc','rto_cricos_chc',
--       'mock_audit','cricos_mock_audit','due_diligence'
--     ]));
-- =====================================================================

ALTER TABLE public.client_audits
  DROP CONSTRAINT client_audits_audit_type_check;

ALTER TABLE public.client_audits
  ADD CONSTRAINT client_audits_audit_type_check
  CHECK (audit_type = ANY (ARRAY[
    'compliance_health_check','cricos_chc','rto_cricos_chc',
    'mock_audit','cricos_mock_audit',
    'due_diligence','due_diligence_combined'
  ]));