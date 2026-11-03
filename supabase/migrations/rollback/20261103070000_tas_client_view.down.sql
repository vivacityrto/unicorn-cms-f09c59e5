-- Rollback for 20261103070000_tas_client_view.sql. Restores the previous policies and the previous
-- bodies of tas__authorise and tas__submit (from 20261103060000_tas_intake_functions.sql), drops
-- the three new functions, the release helpers and the release columns. The columns hold release
-- timestamps only, so dropping them loses no answers. Safe to run more than once.

DROP FUNCTION IF EXISTS public.tas_client_confirm_answers(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tas_client_get_summary(uuid);
DROP FUNCTION IF EXISTS public.tas_staff_release_to_client(uuid, integer);

CREATE OR REPLACE FUNCTION public.tas__authorise(p_intake uuid, p_kind text)
RETURNS public.tas_intake
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint;
  v_row public.tas_intake;
BEGIN
  IF p_kind = 'staff' THEN
    IF NOT public.tas_staff() THEN
      RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
    END IF;
  ELSIF public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff cannot use client functions (the staff preview is read-only)' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tas_intake WHERE id = p_intake;
  IF v_tenant IS NULL OR (p_kind = 'client' AND NOT public.tas_client_actor(v_tenant)) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.tas_intake WHERE id = p_intake FOR UPDATE;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tas__submit(p_intake uuid, p_expected integer, p_key uuid, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_ver public.tas_intake_version;
  v_hash text;
BEGIN
  v_i := public.tas__authorise(p_intake, p_kind);
  SELECT * INTO v_ver FROM public.tas_intake_version WHERE intake_id = v_i.id AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN v_ver.id;
  END IF;
  IF v_i.status NOT IN ('in_progress', 'returned') THEN
    RAISE EXCEPTION 'The intake cannot be submitted in its current state' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_ver FROM public.tas_intake_version
  WHERE intake_id = v_i.id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The intake has no draft version' USING ERRCODE = '22023';
  END IF;

  SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.question_id)::text, '[]'), 'UTF8')), 'hex')
    INTO v_hash
  FROM (SELECT question_id, answer_state, value, applicable, source_type, source_ref, source_checked_at
        FROM public.tas_answer WHERE version_id = v_ver.id) x;

  UPDATE public.tas_intake_version
     SET state = 'submitted', submitted_by = auth.uid(), submitted_at = now(), content_hash = v_hash,
         idempotency_key = p_key
   WHERE id = v_ver.id;
  UPDATE public.tas_intake SET status = 'submitted', row_version = row_version + 1 WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, v_ver.id, p_kind, 'submit', 'tas_intake_version', v_ver.id, NULL,
                            NULL, jsonb_build_object('version_no', v_ver.version_no, 'content_hash', v_hash));
  RETURN v_ver.id;
END;
$function$;

DROP POLICY IF EXISTS tas_answer_select ON public.tas_answer;
CREATE POLICY tas_answer_select ON public.tas_answer FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
DROP POLICY IF EXISTS tas_intake_version_select ON public.tas_intake_version;
CREATE POLICY tas_intake_version_select ON public.tas_intake_version FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
DROP POLICY IF EXISTS tas_intake_select ON public.tas_intake;
CREATE POLICY tas_intake_select ON public.tas_intake FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));

DROP FUNCTION IF EXISTS public.tas_version_released(uuid);
DROP FUNCTION IF EXISTS public.tas_intake_released(uuid);

ALTER TABLE public.tas_intake DROP COLUMN IF EXISTS released_by, DROP COLUMN IF EXISTS released_at;

NOTIFY pgrst, 'reload schema';
