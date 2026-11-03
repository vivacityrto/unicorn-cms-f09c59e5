-- TAS intake: tables, access rules, and freeze / append-only guards. Structure only: no data and no
-- write functions (those are the next PR). Writes will go only through SECURITY DEFINER functions.
--
-- Decisions this encodes (see docs/kb/reference/tas-intake/phase-1/tas-intake-plan.md):
--   one intake per qualification with an optional cohort label (tenant, stage instance,
--   qualification, cohort); RTO and CRICOS clients only (a GTO client cannot be stored); answers
--   carry two separate states (answer and review) plus an "applies" flag; no AI source value;
--   real question wording is private (tas_question is created empty and seeded outside the
--   repository); erasure is an audited redaction, never a delete.
--
-- Pattern, as in 20261028120000_rock_notes.sql: REVOKE ALL then GRANT SELECT only on every table,
-- row-level security on, and the first-line defence of triggers that hold for every role.
-- Rollback: rollback/20261103050000_tas_intake_tables.down.sql

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

-- The question catalogue as data. Created empty: the real wording is seeded privately after the
-- content owner approves it and is never committed to the repository.
CREATE TABLE public.tas_question (
  question_id text NOT NULL CHECK (question_id ~ '^tas\.[a-z0-9]+\.[a-z0-9_]+\.v[0-9]+$'),
  schema_version text NOT NULL,
  prompt text NOT NULL,
  answer_kind text NOT NULL CHECK (answer_kind IN ('text', 'single', 'multi', 'yesno', 'file')),
  phase text NOT NULL
    CHECK (phase IN ('prefill', 'starter', 'branch', 'consultant', 'research', 'later', 'evidence_slot')),
  legacy_ids text[] NOT NULL DEFAULT '{}',
  applies_when jsonb NOT NULL DEFAULT '{"op": "always"}'::jsonb,
  released_at timestamptz,
  PRIMARY KEY (question_id, schema_version)
);

CREATE TABLE public.tas_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  stage_instance_id bigint NOT NULL REFERENCES public.stage_instances(id),
  qualification_code text NOT NULL CHECK (length(btrim(qualification_code)) BETWEEN 1 AND 40),
  cohort_label text NOT NULL DEFAULT '' CHECK (length(cohort_label) <= 80),
  schema_version text NOT NULL,
  -- RTO and CRICOS clients only: a GTO client cannot be stored (National Standards for GTOs 2017).
  client_type text NOT NULL CHECK (client_type IN ('rto', 'cricos')),
  ruleset_version text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'in_review', 'returned', 'approved_for_drafting', 'superseded')),
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
  question_id text NOT NULL,
  schema_version text NOT NULL,
  answer_state text NOT NULL DEFAULT 'unanswered'
    CHECK (answer_state IN ('unanswered', 'answered', 'not_applicable', 'not_decided', 'needs_advice')),
  review_state text NOT NULL DEFAULT 'none'
    CHECK (review_state IN ('none', 'client_reported', 'evidence_received', 'verified', 'rejected', 'returned')),
  value jsonb,
  -- The first value ever recorded; never overwritten, cleared only by a redaction.
  original_value jsonb,
  applicable boolean NOT NULL DEFAULT true,
  -- No AI and no legacy-import value: a model may only propose, and a person then confirms.
  source_type text NOT NULL
    CHECK (source_type IN ('client_typed', 'client_button', 'client_voice_confirmed', 'prefill_tenant_profile',
                           'prefill_tga', 'prefill_prior_version', 'consultant_entered')),
  source_ref text,
  -- Nullable: an unknown source date stays unknown and is never replaced by "now".
  source_checked_at timestamptz,
  client_confirmed_by uuid,
  client_confirmed_at timestamptz,
  previous_answer_id uuid REFERENCES public.tas_answer(id),
  row_version integer NOT NULL DEFAULT 1,
  redacted_at timestamptz,
  redacted_by uuid,
  UNIQUE (version_id, question_id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (version_id, tenant_id) REFERENCES public.tas_intake_version (id, tenant_id),
  FOREIGN KEY (question_id, schema_version) REFERENCES public.tas_question (question_id, schema_version)
);

-- Consultant decisions: staff can read them, clients cannot. Append-only.
CREATE TABLE public.tas_answer_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  tenant_id bigint NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accept', 'edit', 'return')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (answer_id, tenant_id) REFERENCES public.tas_answer (id, tenant_id)
);

-- Durable audit: written in the same transaction as the change it records. Append-only.
CREATE TABLE public.tas_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  intake_id uuid NOT NULL,
  version_id uuid,
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('client', 'staff', 'system')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (intake_id, tenant_id) REFERENCES public.tas_intake (id, tenant_id)
);

-- Row-level security and grants: read-only for signed-in users, nothing for anon -----------------

ALTER TABLE public.tas_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_intake_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_answer_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_audit_event ENABLE ROW LEVEL SECURITY;

-- Wording is private: staff only. Clients will receive it through a function that checks the intake.
CREATE POLICY tas_question_select ON public.tas_question FOR SELECT TO authenticated
  USING (public.tas_staff());
CREATE POLICY tas_intake_select ON public.tas_intake FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
CREATE POLICY tas_intake_version_select ON public.tas_intake_version FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
CREATE POLICY tas_answer_select ON public.tas_answer FOR SELECT TO authenticated
  USING (public.tas_staff() OR public.user_has_full_tenant_access(tenant_id));
-- Consultant decisions and the audit trail never reach a client directly.
CREATE POLICY tas_answer_review_select ON public.tas_answer_review FOR SELECT TO authenticated
  USING (public.tas_staff());
CREATE POLICY tas_audit_event_select ON public.tas_audit_event FOR SELECT TO authenticated
  USING (public.tas_staff());

REVOKE ALL ON public.tas_question, public.tas_intake, public.tas_intake_version, public.tas_answer,
              public.tas_answer_review, public.tas_audit_event FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tas_question, public.tas_intake, public.tas_intake_version, public.tas_answer,
                public.tas_answer_review, public.tas_audit_event TO authenticated;

-- Triggers: the guards hold for every role, including the table owner and service_role ---------

-- The stage must belong to the tenant.
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

-- Intakes, versions and answers are never deleted: a branch change flags an answer and an erasure
-- request redacts it.
CREATE OR REPLACE FUNCTION public.tas_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'TAS intake records are never deleted; flag or redact instead' USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER trg_tas_intake_no_delete BEFORE DELETE ON public.tas_intake
  FOR EACH ROW EXECUTE FUNCTION public.tas_no_delete();
CREATE TRIGGER trg_tas_version_no_delete BEFORE DELETE ON public.tas_intake_version
  FOR EACH ROW EXECUTE FUNCTION public.tas_no_delete();
CREATE TRIGGER trg_tas_answer_no_delete BEFORE DELETE ON public.tas_answer
  FOR EACH ROW EXECUTE FUNCTION public.tas_no_delete();

-- A submitted version is frozen.
CREATE OR REPLACE FUNCTION public.tas_version_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.state = 'submitted' THEN
    RAISE EXCEPTION 'A submitted TAS intake version cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_tas_version_freeze
  BEFORE UPDATE ON public.tas_intake_version
  FOR EACH ROW EXECUTE FUNCTION public.tas_version_freeze();

-- Answers: frozen with their version, except for one structural change, a redaction (D16). A
-- redaction clears the personal content (value becomes a marker, original_value is cleared),
-- stamps redacted_at and redacted_by, and changes nothing else; the audit row is written here, so
-- a redaction cannot happen without one. A client can never redact.
CREATE OR REPLACE FUNCTION public.tas_answer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_state text;
  v_intake uuid;
  v_actor_kind text;
  v_is_redaction boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT state INTO v_state FROM public.tas_intake_version WHERE id = NEW.version_id;
    IF v_state = 'submitted' THEN
      RAISE EXCEPTION 'Answers cannot be added to a submitted TAS intake version' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  SELECT state, intake_id INTO v_state, v_intake FROM public.tas_intake_version WHERE id = OLD.version_id;

  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.version_id IS DISTINCT FROM NEW.version_id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR OLD.question_id IS DISTINCT FROM NEW.question_id
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'An answer cannot be moved to another version, tenant or question' USING ERRCODE = '42501';
  END IF;

  IF OLD.redacted_at IS NOT NULL THEN
    RAISE EXCEPTION 'A redacted answer cannot be changed' USING ERRCODE = '42501';
  END IF;

  v_is_redaction := OLD.redacted_at IS NULL AND NEW.redacted_at IS NOT NULL
    AND NEW.original_value IS NULL
    AND NEW.value = '{"redacted": true}'::jsonb
    AND (to_jsonb(NEW) - 'value' - 'original_value' - 'redacted_at' - 'redacted_by' - 'row_version')
        = (to_jsonb(OLD) - 'value' - 'original_value' - 'redacted_at' - 'redacted_by' - 'row_version');

  IF v_is_redaction THEN
    IF auth.uid() IS NOT NULL AND NOT public.tas_staff() THEN
      RAISE EXCEPTION 'Only authorised staff can redact an answer' USING ERRCODE = '42501';
    END IF;
    v_actor_kind := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'staff' END;
    INSERT INTO public.tas_audit_event (tenant_id, intake_id, version_id, actor_user_id, actor_kind, action,
                                        target_type, target_id, reason)
    VALUES (OLD.tenant_id, v_intake, OLD.version_id, auth.uid(), v_actor_kind, 'redact', 'tas_answer', OLD.id,
            COALESCE(NULLIF(current_setting('tas.redaction_reason', true), ''), 'unspecified'));
    RETURN NEW;
  END IF;

  IF v_state = 'submitted' THEN
    RAISE EXCEPTION 'Answers of a submitted TAS intake version cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.original_value IS NOT NULL AND NEW.original_value IS DISTINCT FROM OLD.original_value THEN
    RAISE EXCEPTION 'The original answer is never overwritten' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_tas_answer_guard
  BEFORE INSERT OR UPDATE ON public.tas_answer
  FOR EACH ROW EXECUTE FUNCTION public.tas_answer_guard();

-- Consultant decisions and the audit trail are append-only.
CREATE OR REPLACE FUNCTION public.tas_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER trg_tas_answer_review_append_only BEFORE UPDATE OR DELETE ON public.tas_answer_review
  FOR EACH ROW EXECUTE FUNCTION public.tas_append_only();
CREATE TRIGGER trg_tas_audit_event_append_only BEFORE UPDATE OR DELETE ON public.tas_audit_event
  FOR EACH ROW EXECUTE FUNCTION public.tas_append_only();

REVOKE ALL ON FUNCTION public.tas_intake_check_stage_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas_no_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas_version_freeze() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas_answer_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas_append_only() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
