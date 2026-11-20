-- 176 documents have documents.framework_type = 'GTO', but 'GTO' is no longer an
-- active value in dd_governance_framework. The validation trigger on documents
-- (trg_validate_documents_lookup_fields) then rejects every update to those rows,
-- including unlinking them from a stage ("Failed to unlink document").
-- Restore 'GTO' as an active value so existing documents stay valid. No document rows change.
-- migration-target-project: yxkgdalkbrriasiyyrwk

INSERT INTO public.dd_governance_framework (value, label, sort_order, is_active)
VALUES ('GTO', 'GTO (Unspecified)', 90, true)
ON CONFLICT (value) DO UPDATE SET is_active = true;
