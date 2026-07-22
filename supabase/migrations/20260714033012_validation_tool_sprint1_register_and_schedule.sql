-- Assessment Validation Tool — Sprint 1 (Unicorn 2.0 Addendum §3, per the
-- unicorn-assessment-validation-tool skill). Tool-centric register: the
-- assessment tool carries compliance state; sessions (Sprint 2) will
-- reference tools, not the other way round. Strictly additive — no
-- existing tables touched.
--
-- NOTE (open decision #4 in the skill): the exact factor -> risk_rating
-- mapping and the annual entitlement rule (2/yr vs annual by tier) are
-- flagged in the source material as unresolved pending a workshop with
-- Sam. The rule below is a documented, adjustable starting point — not a
-- final regulatory position — so Sprint 1 has something to build the UI
-- and schedule engine against without blocking on that workshop.

CREATE TABLE public.validation_tools (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_tenant_id         bigint NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  training_product_code     text,
  unit_code                 text NOT NULL,
  unit_title                text,
  tool_name                 text NOT NULL,
  delivery_mode             text,
  designer_user_id          uuid REFERENCES auth.users(id),
  is_new_tool               boolean NOT NULL DEFAULT true,
  status                    text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','retired')),

  -- Six-factor risk rating (Addendum §3.2)
  high_stakes_licensed      boolean NOT NULL DEFAULT false,
  new_or_revised_tool       boolean NOT NULL DEFAULT false,
  training_package_updated  boolean NOT NULL DEFAULT false,
  high_learner_volume       boolean NOT NULL DEFAULT false,
  complaint_history         boolean NOT NULL DEFAULT false,
  single_assessor_delivery  boolean NOT NULL DEFAULT false,
  risk_factor_count         integer NOT NULL DEFAULT 0,
  priority_review           boolean NOT NULL DEFAULT false,
  risk_rating               text NOT NULL DEFAULT 'medium'
                            CHECK (risk_rating IN ('high','medium','low')),

  -- Triggered validation overlay — independent of the baseline rating.
  -- true means "validate before next use", set by validation_trigger_events.
  validation_required        boolean NOT NULL DEFAULT true, -- new tools start blocked until first validated
  validation_required_reason text,

  -- Schedule register (Addendum §3.2 — "the direct answer to the auditor's
  -- 'show me your validation schedule'"). Populated by staff in Sprint 1;
  -- Sprint 2 sessions will write last_validated_at/method automatically.
  last_validated_at         date,
  last_validated_method     text,
  next_due_date             date,
  responsible_user_id       uuid REFERENCES auth.users(id),

  created_by                uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_tools (subject_tenant_id);
CREATE INDEX ON public.validation_tools (status, validation_required);

COMMENT ON TABLE public.validation_tools IS
  'Assessment Validation Tool Sprint 1 register (Addendum §3). Tool-centric: one row per assessment tool per unit per tenant. Carries risk rating, schedule and trigger-blocked state. Sessions (Sprint 2) will reference this table.';
COMMENT ON COLUMN public.validation_tools.risk_rating IS
  'Baseline rating from the six risk factors. Mapping rule is a documented starting point pending the Sam workshop (open decision #4): high_stakes_licensed or complaint_history -> high; risk_factor_count >= 2 -> high; risk_factor_count = 1 or is_new_tool -> medium; else low.';
COMMENT ON COLUMN public.validation_tools.validation_required IS
  '"Triggered validation blocks use" (Addendum §3.1). Independent of risk_rating. Set true by an unresolved row in validation_trigger_events, or by default for a brand-new tool never yet validated. Cleared when all triggers for the tool are resolved and last_validated_at is set.';

-- Trigger event log (Addendum §3.1/§3.6 — wired to TGA change detection,
-- complaints, assessor inconsistency, audit findings, significant delivery
-- change). Sprint 1 ships the log + the blocking behaviour; the automatic
-- TGA-supersession -> trigger wiring is a follow-on once TGA change
-- detection is live (main report §2.2 notes it is "built but dormant").
CREATE TABLE public.validation_trigger_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id        uuid NOT NULL REFERENCES public.validation_tools(id) ON DELETE CASCADE,
  trigger_source text NOT NULL CHECK (trigger_source IN (
                   'tga_unit_superseded','complaint','assessor_inconsistency',
                   'audit_finding','delivery_change','manual'
                 )),
  detail         text,
  triggered_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES auth.users(id),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_trigger_events (tool_id, resolved_at);

COMMENT ON TABLE public.validation_trigger_events IS
  'Trigger event log for the Assessment Validation Tool (Addendum §3.1). An unresolved row forces validation_tools.validation_required = true on the linked tool.';

-- Keep risk_factor_count / priority_review / risk_rating in sync, and
-- auto-set validation_required for brand-new, never-validated tools.
CREATE OR REPLACE FUNCTION public.fn_validation_tool_set_risk_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.risk_factor_count :=
    (NEW.high_stakes_licensed)::int + (NEW.new_or_revised_tool)::int +
    (NEW.training_package_updated)::int + (NEW.high_learner_volume)::int +
    (NEW.complaint_history)::int + (NEW.single_assessor_delivery)::int;

  NEW.priority_review := NEW.risk_factor_count >= 2;

  NEW.risk_rating := CASE
    WHEN NEW.high_stakes_licensed OR NEW.complaint_history THEN 'high'
    WHEN NEW.risk_factor_count >= 2 THEN 'high'
    WHEN NEW.risk_factor_count = 1 OR NEW.is_new_tool THEN 'medium'
    ELSE 'low'
  END;

  -- A brand-new tool that has never been validated is blocked from use
  -- until the full five-method first-use validation is recorded.
  IF NEW.is_new_tool AND NEW.last_validated_at IS NULL AND TG_OP = 'INSERT' THEN
    NEW.validation_required := true;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validation_tool_set_risk_rating
  BEFORE INSERT OR UPDATE ON public.validation_tools
  FOR EACH ROW EXECUTE FUNCTION public.fn_validation_tool_set_risk_rating();

-- Logging a trigger event blocks the tool immediately (Addendum §3.1:
-- "Triggered validation blocks use").
CREATE OR REPLACE FUNCTION public.fn_validation_trigger_event_block_tool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.validation_tools
  SET validation_required = true,
      validation_required_reason = NEW.trigger_source || COALESCE(': ' || NEW.detail, ''),
      updated_at = now()
  WHERE id = NEW.tool_id;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validation_trigger_event_block_tool
  AFTER INSERT ON public.validation_trigger_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_validation_trigger_event_block_tool();

-- Resolve a trigger event; clears validation_required on the tool only if
-- no other unresolved triggers remain and the tool has a validation on
-- record (a never-validated new tool stays blocked regardless).
CREATE OR REPLACE FUNCTION public.rpc_resolve_validation_trigger(
  p_trigger_id uuid,
  p_resolved_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tool_id uuid;
  v_remaining integer;
  v_last_validated date;
BEGIN
  UPDATE public.validation_trigger_events
  SET resolved_at = now(),
      resolved_by = COALESCE(p_resolved_by, auth.uid())
  WHERE id = p_trigger_id AND resolved_at IS NULL
  RETURNING tool_id INTO v_tool_id;

  IF v_tool_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trigger not found or already resolved');
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.validation_trigger_events
  WHERE tool_id = v_tool_id AND resolved_at IS NULL;

  SELECT last_validated_at INTO v_last_validated
  FROM public.validation_tools WHERE id = v_tool_id;

  IF v_remaining = 0 AND v_last_validated IS NOT NULL THEN
    UPDATE public.validation_tools
    SET validation_required = false,
        validation_required_reason = NULL,
        updated_at = now()
    WHERE id = v_tool_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'tool_id', v_tool_id, 'remaining_triggers', v_remaining);
END;
$function$;

-- Rules-only red-flag dashboard (Addendum §3.5). Only the flags computable
-- from Sprint 1 data are included here; designer-only validation, checklist
-- without evidence, and duplicate generic records need Sprint 2 session
-- data and are left as a follow-on.
CREATE VIEW public.validation_red_flags_v
WITH (security_invoker = true) AS
SELECT
  vt.id AS tool_id,
  vt.subject_tenant_id,
  vt.tool_name,
  vt.unit_code,
  vt.risk_rating,
  vt.validation_required,
  vt.validation_required_reason,
  (vt.last_validated_at IS NULL) AS flag_no_validation_record,
  (vt.last_validated_at IS NOT NULL
     AND vt.last_validated_at < (CURRENT_DATE - INTERVAL '12 months')) AS flag_validation_over_12_months,
  vt.validation_required AS flag_blocked_pending_validation,
  vt.next_due_date,
  (vt.next_due_date IS NOT NULL AND vt.next_due_date < CURRENT_DATE) AS flag_overdue
FROM public.validation_tools vt
WHERE vt.status = 'active';

COMMENT ON VIEW public.validation_red_flags_v IS
  'Rules-only red-flag view for the Assessment Validation Tool (Addendum §3.5), Sprint 1 subset. security_invoker=true so it respects the querying user''s RLS, not the view owner''s.';

-- RLS
ALTER TABLE public.validation_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_trigger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validation_tools_select_tenant_or_staff"
ON public.validation_tools FOR SELECT TO authenticated
USING (public.has_tenant_access_safe(subject_tenant_id, auth.uid()));

CREATE POLICY "validation_tools_write_staff_only"
ON public.validation_tools FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "validation_trigger_events_select_tenant_or_staff"
ON public.validation_trigger_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_tools vt
  WHERE vt.id = validation_trigger_events.tool_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_trigger_events_write_staff_only"
ON public.validation_trigger_events FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));