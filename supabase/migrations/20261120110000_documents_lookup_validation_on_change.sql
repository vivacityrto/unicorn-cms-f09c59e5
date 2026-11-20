-- Validate a document's lookup values only when they change.
-- Before this, every UPDATE re-checked every lookup field. Documents whose
-- framework_type was retired (the generic 'GTO', now state-specific values) could
-- not be updated for any reason, including unlinking from a stage.
-- migration-target-project: yxkgdalkbrriasiyyrwk

CREATE OR REPLACE FUNCTION public.trg_validate_documents_lookup_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.document_status IS DISTINCT FROM OLD.document_status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dd_document_status
      WHERE value = NEW.document_status AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Invalid document_status: %. Must match an active value in dd_document_status.', NEW.document_status;
    END IF;
  END IF;

  IF NEW.framework_type IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.framework_type IS DISTINCT FROM OLD.framework_type)
     AND NOT EXISTS (
       SELECT 1 FROM public.dd_governance_framework
       WHERE value = NEW.framework_type AND is_active = true
     ) THEN
    RAISE EXCEPTION 'Invalid framework_type: %. Must match an active value in dd_governance_framework.', NEW.framework_type;
  END IF;

  IF NEW.ai_analysis_status IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.ai_analysis_status IS DISTINCT FROM OLD.ai_analysis_status)
     AND NOT EXISTS (
       SELECT 1 FROM public.dd_ai_analysis_status
       WHERE value = NEW.ai_analysis_status AND is_active = true
     ) THEN
    RAISE EXCEPTION 'Invalid ai_analysis_status: %. Must match an active value in dd_ai_analysis_status.', NEW.ai_analysis_status;
  END IF;

  IF NEW.ai_status IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.ai_status IS DISTINCT FROM OLD.ai_status)
     AND NOT EXISTS (
       SELECT 1 FROM public.dd_ai_status
       WHERE value = NEW.ai_status AND is_active = true
     ) THEN
    RAISE EXCEPTION 'Invalid ai_status: %. Must match an active value in dd_ai_status.', NEW.ai_status;
  END IF;

  RETURN NEW;
END;
$function$;
