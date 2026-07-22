-- Assessment Validation Tool — Sprint 2 (Addendum §3.3/§3.4, per the
-- unicorn-assessment-validation-tool skill). Desktop checklist, peer
-- review and evidence sampling workflows; mapping matrix scaffold;
-- session management with independence enforcement, findings, actions,
-- dual sign-off. Assessor simulation and trial/pilot workflows are
-- Sprint 3 (AI layer) per the agreed build sequence — methods_used allows
-- those values now so Sprint 3 doesn't need a schema change, but no
-- workflow tables for them ship yet.
--
-- Strictly additive on top of Sprint 1 (validation_tools,
-- validation_trigger_events). No existing tables touched.

CREATE TABLE public.validation_sessions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id                       uuid NOT NULL REFERENCES public.validation_tools(id) ON DELETE CASCADE,
  session_type                  text NOT NULL CHECK (session_type IN ('pre_use','post_use')),
  methods_used                  text[] NOT NULL DEFAULT '{}'
                                CHECK (methods_used <@ ARRAY['desktop','peer_review','assessor_simulation','trial_assessment','evidence_sampling']::text[]),
  scheduled_date                date,
  session_date                  date,
  pack_distributed_at           timestamptz,
  validator_user_id             uuid NOT NULL REFERENCES auth.users(id),
  independent_reviewer_user_id  uuid NOT NULL REFERENCES auth.users(id),
  status                        text NOT NULL DEFAULT 'scheduled'
                                CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  tool_outcome                  text CHECK (tool_outcome IN ('approved','approved_with_minor_revisions','requires_significant_revision')),
  trigger_event_id              uuid REFERENCES public.validation_trigger_events(id),
  created_by                    uuid REFERENCES auth.users(id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_sessions (tool_id);
CREATE INDEX ON public.validation_sessions (status);

COMMENT ON TABLE public.validation_sessions IS
  'Sprint 2: the collaborative wrapper referencing a validation_tools row (Addendum §3.6 — sessions reference tools, tools carry compliance state). Independence and completion gates enforced by trg_validation_session_guard.';
COMMENT ON COLUMN public.validation_sessions.pack_distributed_at IS
  'Addendum §3.4: pre-session pack must be distributed at least 3 days before session_date. Enforced by trg_validation_session_guard when both dates are set.';

CREATE TABLE public.validation_findings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  method         text CHECK (method IN ('desktop','peer_review','assessor_simulation','trial_assessment','evidence_sampling', NULL)),
  finding_text   text NOT NULL,
  standard_clause text,
  decision       text NOT NULL DEFAULT 'requires_revision'
                 CHECK (decision IN ('resolved','requires_revision','escalated')),
  raised_by      uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

CREATE INDEX ON public.validation_findings (session_id, decision);

COMMENT ON COLUMN public.validation_findings.standard_clause IS
  'Free-text SRTO 2025 clause reference. Deliberately not an enum/FK — clause mapping is an open decision pending the Sam workshop (see unicorn-assessment-validation-tool skill).';

CREATE TABLE public.validation_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    uuid NOT NULL REFERENCES public.validation_findings(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  description   text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id),
  due_date      date,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  completed_at  timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_actions (session_id, status);

CREATE TABLE public.validation_signoffs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('validator','independent_reviewer')),
  signed_by   uuid NOT NULL REFERENCES auth.users(id),
  signed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, role)
);

COMMENT ON TABLE public.validation_signoffs IS
  'Dual sign-off (Addendum §3.4). trg_validation_session_guard blocks status=completed until both roles have signed.';

-- Desktop validation + peer review share the same 17-item/5-section
-- checklist shape (Addendum §3.3) — checklist_role distinguishes the two,
-- which is what makes the "side-by-side reconcile view" a simple query
-- rather than a second schema.
CREATE TABLE public.validation_checklist_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  checklist_role  text NOT NULL CHECK (checklist_role IN ('validator','peer_reviewer')),
  section_no      integer NOT NULL,
  item_no         integer NOT NULL,
  item_text       text NOT NULL,
  result          text NOT NULL DEFAULT 'unclear' CHECK (result IN ('met','not_met','unclear')),
  ai_prefilled    boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, checklist_role, section_no, item_no)
);

CREATE INDEX ON public.validation_checklist_items (session_id);

CREATE TABLE public.validation_evidence_sampling_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  task_ref             text NOT NULL,
  unit_requirement_ref text,
  model_response       text,
  flag                 text CHECK (flag IN ('ok','too_brief','vague','narrow', NULL)),
  ai_drafted           boolean NOT NULL DEFAULT false,
  reviewed_by          uuid REFERENCES auth.users(id),
  reviewed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_evidence_sampling_items (session_id);

-- Mapping matrix (Addendum §3.4) — scoped to the tool, not a single
-- session, since a tool's mapping is reviewed/updated across sessions
-- rather than rebuilt each time. Gap / over-assessment flags are
-- aggregate properties (per requirement, across all its task mappings)
-- so they live in validation_mapping_gaps_v below, not as denormalised
-- columns that could go stale.
CREATE TABLE public.validation_mapping_cells (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id          uuid NOT NULL REFERENCES public.validation_tools(id) ON DELETE CASCADE,
  requirement_type text NOT NULL CHECK (requirement_type IN
                    ('element_pc','performance_evidence','knowledge_evidence','foundation_skill','assessment_condition')),
  requirement_ref  text NOT NULL,
  requirement_text text,
  task_ref         text NOT NULL,
  is_mapped        boolean NOT NULL DEFAULT false,
  ai_suggested     boolean NOT NULL DEFAULT false,
  confirmed_by     uuid REFERENCES auth.users(id),
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tool_id, requirement_type, requirement_ref, task_ref)
);

CREATE INDEX ON public.validation_mapping_cells (tool_id);

CREATE VIEW public.validation_mapping_gaps_v
WITH (security_invoker = true) AS
SELECT
  tool_id,
  requirement_type,
  requirement_ref,
  requirement_text,
  COUNT(*) FILTER (WHERE is_mapped) AS mapped_task_count,
  (COUNT(*) FILTER (WHERE is_mapped) = 0) AS gap_flag,
  (COUNT(*) FILTER (WHERE is_mapped) > 3) AS over_assessment_flag
FROM public.validation_mapping_cells
GROUP BY tool_id, requirement_type, requirement_ref, requirement_text;

COMMENT ON VIEW public.validation_mapping_gaps_v IS
  '"If it''s not in the mapping, it''s not in the assessment" (Addendum §3.4). over_assessment_flag threshold (>3 tasks) is a starting default, adjustable.';

-- Independence + completion gate (Addendum §3.1/§3.4).
CREATE OR REPLACE FUNCTION public.fn_validation_session_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_designer_id uuid;
  v_open_findings integer;
  v_signoff_count integer;
BEGIN
  -- Independence: validator != reviewer != tool designer/deliverer.
  SELECT designer_user_id INTO v_designer_id
  FROM public.validation_tools WHERE id = NEW.tool_id;

  IF NEW.validator_user_id = NEW.independent_reviewer_user_id THEN
    RAISE EXCEPTION 'The validator and the independent reviewer must be different people';
  END IF;

  IF v_designer_id IS NOT NULL AND
     (NEW.validator_user_id = v_designer_id OR NEW.independent_reviewer_user_id = v_designer_id) THEN
    RAISE EXCEPTION 'The tool''s designer/deliverer cannot act as validator or independent reviewer';
  END IF;

  -- Pre-distribution rule: pack must go out >= 3 days before the session.
  IF NEW.pack_distributed_at IS NOT NULL AND NEW.session_date IS NOT NULL
     AND NEW.pack_distributed_at::date > (NEW.session_date - INTERVAL '3 days')::date THEN
    RAISE EXCEPTION 'Pre-session pack must be distributed at least 3 days before the session date';
  END IF;

  -- Outcome gate: cannot approve while findings remain open.
  IF NEW.tool_outcome IN ('approved','approved_with_minor_revisions') THEN
    SELECT COUNT(*) INTO v_open_findings
    FROM public.validation_findings
    WHERE session_id = NEW.id AND decision <> 'resolved';
    IF v_open_findings > 0 THEN
      RAISE EXCEPTION 'Cannot set an approved outcome while % finding(s) remain open', v_open_findings;
    END IF;
  END IF;

  -- Completion gate: requires an outcome and both signatures.
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.tool_outcome IS NULL THEN
      RAISE EXCEPTION 'Cannot complete a session without a tool_outcome';
    END IF;

    SELECT COUNT(DISTINCT role) INTO v_signoff_count
    FROM public.validation_signoffs WHERE session_id = NEW.id;
    IF v_signoff_count < 2 THEN
      RAISE EXCEPTION 'Cannot complete a session until both the validator and the independent reviewer have signed off';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validation_session_guard
  BEFORE INSERT OR UPDATE ON public.validation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_validation_session_guard();

-- On completion, close the loop back to the Sprint 1 register: stamp
-- last_validated_at/method on the tool, and clear validation_required
-- unless another unresolved trigger event still applies.
CREATE OR REPLACE FUNCTION public.fn_validation_session_sync_tool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_triggers integer;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NEW.trigger_event_id IS NOT NULL THEN
      UPDATE public.validation_trigger_events
      SET resolved_at = now(), resolved_by = NEW.validator_user_id
      WHERE id = NEW.trigger_event_id AND resolved_at IS NULL;
    END IF;

    SELECT COUNT(*) INTO v_remaining_triggers
    FROM public.validation_trigger_events
    WHERE tool_id = NEW.tool_id AND resolved_at IS NULL;

    UPDATE public.validation_tools
    SET last_validated_at = COALESCE(NEW.session_date, CURRENT_DATE),
        last_validated_method = array_to_string(NEW.methods_used, ', '),
        is_new_tool = false,
        validation_required = (v_remaining_triggers > 0),
        validation_required_reason = CASE WHEN v_remaining_triggers = 0 THEN NULL ELSE validation_required_reason END,
        updated_at = now()
    WHERE id = NEW.tool_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validation_session_sync_tool
  AFTER UPDATE ON public.validation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_validation_session_sync_tool();

-- RLS — same tenant-or-staff / staff-only pattern as Sprint 1, joined
-- through validation_tools since these child tables carry no tenant_id
-- of their own.
ALTER TABLE public.validation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_evidence_sampling_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_mapping_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validation_sessions_select_tenant_or_staff"
ON public.validation_sessions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_tools vt
  WHERE vt.id = validation_sessions.tool_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_sessions_write_staff_only"
ON public.validation_sessions FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_findings_select_tenant_or_staff"
ON public.validation_findings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_findings.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_findings_write_staff_only"
ON public.validation_findings FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_actions_select_tenant_or_staff"
ON public.validation_actions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_actions.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_actions_write_staff_only"
ON public.validation_actions FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_signoffs_select_tenant_or_staff"
ON public.validation_signoffs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_signoffs.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_signoffs_write_staff_only"
ON public.validation_signoffs FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_checklist_items_select_tenant_or_staff"
ON public.validation_checklist_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_checklist_items.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_checklist_items_write_staff_only"
ON public.validation_checklist_items FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_evidence_sampling_items_select_tenant_or_staff"
ON public.validation_evidence_sampling_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_evidence_sampling_items.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_evidence_sampling_items_write_staff_only"
ON public.validation_evidence_sampling_items FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_mapping_cells_select_tenant_or_staff"
ON public.validation_mapping_cells FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_tools vt
  WHERE vt.id = validation_mapping_cells.tool_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_mapping_cells_write_staff_only"
ON public.validation_mapping_cells FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));