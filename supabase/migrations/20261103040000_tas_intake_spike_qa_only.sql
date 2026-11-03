-- TAS intake SPIKE: QA ONLY. NEVER APPLY TO PRODUCTION. This PR is a draft and is not for merge.
--
-- migration-target-project: qfpxvumcrnzrjyvqkicq
--
-- Throwaway vertical slice to prove the access, concurrency and freeze patterns before the real
-- schema decisions are locked: one starter question, staff-run, three tables, two helpers and two
-- RPCs. Provisional choices (not decisions): D5 intake key = (tenant, stage instance,
-- qualification, cohort label); D15 new TAS helpers over tenant_users; D20 two-axis answer state.
-- Everything here is dropped by rollback/20261103040000_tas_intake_spike_qa_only.down.sql.
--
-- Pattern, copied from 20261028120000_rock_notes.sql: REVOKE ALL then GRANT SELECT only on every
-- table, RLS SELECT policies, writes only through SECURITY DEFINER RPCs with an empty search_path.

-- Helpers ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tas_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_vivacity_team_safe(auth.uid());
$function$;

-- A client user who may act on the tenant's TAS intake: signed in, not staff, full-scope member,
-- not disabled or archived, tenant writeable.
CREATE OR REPLACE FUNCTION public.tas_client_actor(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND public.user_has_full_tenant_access(p_tenant_id)
    AND public.tenant_is_writeable(p_tenant_id);
$function$;

REVOKE ALL ON FUNCTION public.tas_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_client_actor(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tas_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_client_actor(bigint) TO authenticated;

-- Tables ----------------------------------------------------------------------------------------

CREATE TABLE public.tas_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  stage_instance_id bigint NOT NULL REFERENCES public.stage_instances(id),
  qualification_code text NOT NULL CHECK (length(btrim(qualification_code)) BETWEEN 1 AND 40),
  cohort_label text NOT NULL DEFAULT '' CHECK (length(cohort_label) <= 80),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, stage_instance_id, qualification_code, cohort_label)
);

CREATE TABLE public.tas_intake_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL,
  tenant_id bigint NOT NULL,
  version_no integer NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'submitted')),
  prefill_snapshot jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  content_hash text,
  idempotency_key uuid,
  UNIQUE (intake_id, version_no),
  UNIQUE (intake_id, idempotency_key),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (intake_id, tenant_id) REFERENCES public.tas_intake (id, tenant_id)
);

CREATE TABLE public.tas_answer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  tenant_id bigint NOT NULL,
  question_id text NOT NULL CHECK (question_id = 'tas.product.qualification.v1'),
  answer_state text NOT NULL DEFAULT 'unanswered'
    CHECK (answer_state IN ('unanswered', 'answered', 'not_applicable', 'not_decided', 'needs_advice')),
  review_state text NOT NULL DEFAULT 'none'
    CHECK (review_state IN ('none', 'client_reported', 'evidence_received', 'verified', 'rejected', 'returned')),
  value jsonb,
  original_value jsonb,
  applicable boolean NOT NULL DEFAULT true,
  source_type text NOT NULL
    CHECK (source_type IN ('client_typed', 'client_button', 'prefill_tenant_profile', 'prefill_tga', 'consultant_entered')),
  source_ref text,
  source_checked_at timestamptz,
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (version_id, question_id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (version_id, tenant_id) REFERENCES public.tas_intake_version (id, tenant_id)
);

-- Row-level security and grants: read-only for signed-in users, nothing for anon.
ALTER TABLE public.tas_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_intake_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_answer ENABLE ROW LEVEL SECURITY;

CREATE POLICY tas_intake_select ON public.tas_intake FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
CREATE POLICY tas_intake_version_select ON public.tas_intake_version FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
CREATE POLICY tas_answer_select ON public.tas_answer FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));

REVOKE ALL ON public.tas_intake, public.tas_intake_version, public.tas_answer FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tas_intake, public.tas_intake_version, public.tas_answer TO authenticated;

-- Triggers: the stage must belong to the tenant; a submitted version is frozen for every role ----

CREATE OR REPLACE FUNCTION public.tas_intake_check_stage_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF public.stage_instance_tenant_id(NEW.stage_instance_id) IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'The stage does not belong to this tenant' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_tas_intake_check_stage_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, stage_instance_id ON public.tas_intake
  FOR EACH ROW EXECUTE FUNCTION public.tas_intake_check_stage_tenant();

CREATE OR REPLACE FUNCTION public.tas_version_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.state = 'submitted' THEN
    RAISE EXCEPTION 'A submitted TAS intake version cannot be changed or deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_tas_version_freeze
  BEFORE UPDATE OR DELETE ON public.tas_intake_version
  FOR EACH ROW EXECUTE FUNCTION public.tas_version_freeze();

CREATE OR REPLACE FUNCTION public.tas_answer_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_state text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT state INTO v_state FROM public.tas_intake_version WHERE id = NEW.version_id;
  ELSE
    SELECT state INTO v_state FROM public.tas_intake_version WHERE id = OLD.version_id;
  END IF;
  IF v_state = 'submitted' THEN
    RAISE EXCEPTION 'Answers of a submitted TAS intake version cannot be changed or deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_tas_answer_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.tas_answer
  FOR EACH ROW EXECUTE FUNCTION public.tas_answer_freeze();

-- RPCs: staff-run in the spike; every write goes through here ----------------------------------

-- Start an intake for a stage. The tenant is derived from the stage, never taken from the caller.
CREATE OR REPLACE FUNCTION public.tas_start_intake(
  p_stage_instance_id bigint,
  p_qualification_code text,
  p_cohort_label text DEFAULT '',
  p_prefill jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint;
  v_intake uuid;
BEGIN
  IF NOT public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  v_tenant := public.stage_instance_tenant_id(p_stage_instance_id);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Stage not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, cohort_label, created_by)
  VALUES (v_tenant, p_stage_instance_id, btrim(p_qualification_code), COALESCE(p_cohort_label, ''), auth.uid())
  RETURNING id INTO v_intake;
  INSERT INTO public.tas_intake_version (intake_id, tenant_id, version_no, prefill_snapshot)
  VALUES (v_intake, v_tenant, 1, p_prefill);
  RETURN v_intake;
END;
$function$;

-- Save the starter answer on the draft version. Optimistic concurrency on the intake row_version:
-- a stale expected version raises SQLSTATE 40001 and changes nothing.
CREATE OR REPLACE FUNCTION public.tas_save_answers(
  p_intake_id uuid,
  p_expected_row_version integer,
  p_answers jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_intake public.tas_intake%ROWTYPE;
  v_version public.tas_intake_version%ROWTYPE;
  a jsonb;
BEGIN
  IF NOT public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_intake FROM public.tas_intake WHERE id = p_intake_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;
  IF v_intake.status <> 'in_progress' THEN
    RAISE EXCEPTION 'The intake is submitted and cannot be edited' USING ERRCODE = '42501';
  END IF;
  IF v_intake.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_version FROM public.tas_intake_version
  WHERE intake_id = p_intake_id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be an array' USING ERRCODE = '22023';
  END IF;
  FOR a IN SELECT e FROM jsonb_array_elements(p_answers) e LOOP
    INSERT INTO public.tas_answer (version_id, tenant_id, question_id, answer_state, value, original_value,
                                   source_type, source_ref, source_checked_at)
    VALUES (v_version.id, v_intake.tenant_id, a->>'question_id', COALESCE(a->>'answer_state', 'answered'),
            a->'value', a->'value', a->>'source_type', a->>'source_ref',
            NULLIF(a->>'source_checked_at', '')::timestamptz)
    ON CONFLICT (version_id, question_id) DO UPDATE
      SET answer_state = EXCLUDED.answer_state, value = EXCLUDED.value,
          source_type = EXCLUDED.source_type, source_ref = EXCLUDED.source_ref,
          source_checked_at = EXCLUDED.source_checked_at,
          row_version = public.tas_answer.row_version + 1;
  END LOOP;
  UPDATE public.tas_intake SET row_version = row_version + 1 WHERE id = p_intake_id;
  RETURN v_intake.row_version + 1;
END;
$function$;

-- Submit: freeze the draft version with a content hash. Idempotent on the key.
CREATE OR REPLACE FUNCTION public.tas_submit(
  p_intake_id uuid,
  p_expected_row_version integer,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_intake public.tas_intake%ROWTYPE;
  v_version public.tas_intake_version%ROWTYPE;
  v_hash text;
BEGIN
  IF NOT public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_intake FROM public.tas_intake WHERE id = p_intake_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_version FROM public.tas_intake_version
  WHERE intake_id = p_intake_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_version.id;
  END IF;
  IF v_intake.status <> 'in_progress' THEN
    RAISE EXCEPTION 'The intake is already submitted' USING ERRCODE = '42501';
  END IF;
  IF v_intake.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_version FROM public.tas_intake_version
  WHERE intake_id = p_intake_id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.question_id)::text, '[]')) INTO v_hash
  FROM (SELECT question_id, answer_state, value, source_type, source_ref, source_checked_at
        FROM public.tas_answer WHERE version_id = v_version.id) x;
  UPDATE public.tas_intake_version
     SET state = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
         content_hash = v_hash, idempotency_key = p_idempotency_key
   WHERE id = v_version.id;
  UPDATE public.tas_intake SET status = 'submitted', row_version = row_version + 1 WHERE id = p_intake_id;
  RETURN v_version.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.tas_start_intake(bigint, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_save_answers(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_submit(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tas_start_intake(bigint, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_save_answers(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_submit(uuid, integer, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
