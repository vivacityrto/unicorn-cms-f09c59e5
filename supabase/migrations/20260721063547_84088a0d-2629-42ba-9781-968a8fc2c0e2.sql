CREATE OR REPLACE FUNCTION public.sync_document_stage_links_on_primary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.document_stage_links
  WHERE document_id = NEW.id AND stage_id = NEW.stage;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_document_stage_links_on_primary_change() FROM PUBLIC;

CREATE TRIGGER trg_sync_document_stage_links_on_primary_change
AFTER UPDATE OF stage ON public.documents
FOR EACH ROW
WHEN (NEW.stage IS NOT NULL AND OLD.stage IS DISTINCT FROM NEW.stage)
EXECUTE FUNCTION public.sync_document_stage_links_on_primary_change();