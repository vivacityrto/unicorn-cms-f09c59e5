# Widen `client_audits.audit_type` CHECK constraint

## Verification
Queried `pg_constraint` — `client_audits_audit_type_check` still allows only the original 6 values. `'due_diligence_combined'` is missing. Migration not yet applied.

## Single migration to run

```sql
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
```

## Scope
- Database only. No RLS, trigger, index, view, or other constraint changes.
- No frontend or edge function changes.

## Post-migration verification
Re-query `pg_get_constraintdef` to confirm the new 7-value list is in place.
