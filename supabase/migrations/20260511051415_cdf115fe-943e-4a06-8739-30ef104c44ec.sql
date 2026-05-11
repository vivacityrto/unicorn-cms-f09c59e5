-- Hard idempotency on auto-evidence rows
CREATE UNIQUE INDEX IF NOT EXISTS pdp_evidence_unique_completion
  ON public.pdp_evidence_items (source_enrollment_id)
  WHERE evidence_type = 'academy_completion' AND source_enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pdp_evidence_unique_certificate
  ON public.pdp_evidence_items (source_certificate_id)
  WHERE evidence_type = 'academy_certificate' AND source_certificate_id IS NOT NULL;

-- Trigger function: dispatches an async pg_net POST after status flips to 'completed'
CREATE OR REPLACE FUNCTION public.trg_pdp_auto_evidence_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/pdp-auto-evidence';
  v_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_key, '')
        ),
        body    := jsonb_build_object('enrollment_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pdp-auto-evidence dispatch failed for enrollment %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pdp_auto_evidence_after_complete ON public.academy_enrollments;
CREATE TRIGGER pdp_auto_evidence_after_complete
AFTER UPDATE OF status ON public.academy_enrollments
FOR EACH ROW EXECUTE FUNCTION public.trg_pdp_auto_evidence_on_completion();