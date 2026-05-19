-- ============================================================
-- PRE-FLIGHT
-- ============================================================
DO $$
DECLARE v_bad_count integer;
BEGIN
  SELECT COUNT(*) INTO v_bad_count
  FROM public.eos_issues
  WHERE status::text NOT IN ('Open','Discussing','Solved','Archived','In Review','Actioning','Escalated','Closed')
    AND status IS NOT NULL;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Pre-flight failed: % unexpected status values in eos_issues', v_bad_count;
  END IF;
END $$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.eos_issue_status_transitions;
  IF v_count <> 19 THEN
    RAISE EXCEPTION 'Pre-flight failed: expected 19 transition rows, found %', v_count;
  END IF;
END $$;

-- ============================================================
-- STEP 1: Create + seed dd_eos_issue_status
-- ============================================================
CREATE TABLE public.dd_eos_issue_status (
  id         serial      NOT NULL,
  value      text        NOT NULL,
  label      text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_eos_issue_status_pkey PRIMARY KEY (id),
  CONSTRAINT dd_eos_issue_status_value_key UNIQUE (value)
);

INSERT INTO public.dd_eos_issue_status (value, label, sort_order) VALUES
  ('Open',       'Open',       1),
  ('Discussing', 'Discussing', 2),
  ('Solved',     'Solved',     3),
  ('Archived',   'Archived',   4),
  ('In Review',  'In Review',  5),
  ('Actioning',  'Actioning',  6),
  ('Escalated',  'Escalated',  7),
  ('Closed',     'Closed',     8);

ALTER TABLE public.dd_eos_issue_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_eos_issue_status_public_select"
  ON public.dd_eos_issue_status FOR SELECT USING (true);

-- ============================================================
-- STEP 2: Drop all dependent views
-- ============================================================
DROP VIEW IF EXISTS public.v_executive_consultant_distribution;
DROP VIEW IF EXISTS public.v_executive_client_health;
DROP VIEW IF EXISTS public.v_predictive_signal_inputs;
DROP VIEW IF EXISTS public.v_completion_eligibility;
DROP VIEW IF EXISTS public.v_progress_anchor_inputs;
DROP VIEW IF EXISTS public.v_momentum_state;
DROP VIEW IF EXISTS public.v_phase_actions_remaining;
DROP VIEW IF EXISTS public.v_dashboard_consultant_momentum;
DROP VIEW IF EXISTS public.v_score_risks;
DROP VIEW IF EXISTS public.v_client_risk_summary;
DROP VIEW IF EXISTS public.v_client_risks_actions;
DROP VIEW IF EXISTS public.v_client_eos_summary;
DROP VIEW IF EXISTS public.eos_issue_status_options;

-- ============================================================
-- STEP 3: Migrate eos_issues.status
-- ============================================================
ALTER TABLE public.eos_issues ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.eos_issues ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.eos_issues ALTER COLUMN status SET DEFAULT 'Open'::text;

ALTER TABLE public.eos_issues
  ADD CONSTRAINT fk_eos_issues_status
  FOREIGN KEY (status) REFERENCES public.dd_eos_issue_status(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ============================================================
-- STEP 4: Migrate eos_issue_status_transitions
-- ============================================================
ALTER TABLE public.eos_issue_status_transitions
  DROP CONSTRAINT eos_issue_status_transitions_pkey;

ALTER TABLE public.eos_issue_status_transitions
  ALTER COLUMN from_status TYPE text USING from_status::text,
  ALTER COLUMN to_status   TYPE text USING to_status::text;

ALTER TABLE public.eos_issue_status_transitions
  ADD CONSTRAINT eos_issue_status_transitions_pkey PRIMARY KEY (from_status, to_status),
  ADD CONSTRAINT fk_transitions_from_status
    FOREIGN KEY (from_status) REFERENCES public.dd_eos_issue_status(value)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_transitions_to_status
    FOREIGN KEY (to_status) REFERENCES public.dd_eos_issue_status(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ============================================================
-- STEP 5: Recreate set_issue_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_issue_status(
  p_issue_id uuid,
  p_status text,
  p_solution_text text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_issue RECORD;
  v_user_id uuid := auth.uid();
  v_old_status text;
  v_active_meeting_id uuid;
BEGIN
  SELECT * INTO v_issue FROM public.eos_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  v_old_status := v_issue.status;

  IF p_status IN ('Discussing', 'Solved') AND v_issue.meeting_id IS NULL THEN
    SELECT m.id INTO v_active_meeting_id
    FROM public.eos_meetings m
    INNER JOIN public.eos_meeting_attendees a ON a.meeting_id = m.id
    WHERE m.tenant_id = v_issue.tenant_id
      AND m.is_complete = false
      AND a.user_id = v_user_id
      AND a.attendance_status IN ('attended', 'late')
    ORDER BY m.scheduled_date DESC
    LIMIT 1;

    IF v_active_meeting_id IS NOT NULL THEN
      UPDATE public.eos_issues SET meeting_id = v_active_meeting_id WHERE id = p_issue_id;
      v_issue.meeting_id := v_active_meeting_id;
    END IF;
  END IF;

  UPDATE public.eos_issues
  SET
    status      = p_status,
    solution    = COALESCE(p_solution_text, solution),
    solved_at   = CASE WHEN p_status = 'Solved' THEN now() ELSE solved_at END,
    resolved_by = CASE WHEN p_status = 'Solved' THEN v_user_id ELSE resolved_by END,
    updated_at  = now()
  WHERE id = p_issue_id;

  IF p_status = 'Solved' AND v_issue.meeting_id IS NOT NULL THEN
    UPDATE public.eos_meetings
    SET issues_discussed = COALESCE(issues_discussed, '{}') || ARRAY[p_issue_id]
    WHERE id = v_issue.meeting_id
      AND NOT (p_issue_id = ANY(COALESCE(issues_discussed, '{}')));
  END IF;

  INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
  VALUES (
    v_issue.tenant_id, 'issue', p_issue_id, 'status_change', v_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_status,
      'meeting_linked', v_issue.meeting_id IS NOT NULL
    )
  );
END;
$function$;

-- ============================================================
-- STEP 6: eos_issue_status_options
-- ============================================================
CREATE VIEW public.eos_issue_status_options
WITH (security_invoker = true) AS
SELECT value FROM public.dd_eos_issue_status
WHERE is_active = true
ORDER BY sort_order;

GRANT SELECT ON public.eos_issue_status_options TO authenticated, anon;

-- ============================================================
-- STEP 7: Recreate dependent views (::eos_issue_status -> ::text)
-- ============================================================

CREATE VIEW public.v_client_risk_summary AS
 SELECT ei.tenant_id,
    count(*) FILTER (WHERE ((ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.deleted_at IS NULL))) AS active_risks,
    count(*) FILTER (WHERE ((ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.deleted_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text])))) AS active_critical,
    count(*) FILTER (WHERE ((ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.deleted_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text])))) AS high_or_critical
   FROM public.eos_issues ei
  GROUP BY ei.tenant_id;

CREATE VIEW public.v_score_risks AS
 SELECT ei.tenant_id,
    count(*) FILTER (WHERE ((ei.impact = 'Low'::text) OR (ei.impact = 'low'::text))) AS active_low,
    count(*) FILTER (WHERE ((ei.impact = 'Medium'::text) OR (ei.impact = 'medium'::text))) AS active_medium,
    count(*) FILTER (WHERE ((ei.impact = 'High'::text) OR (ei.impact = 'high'::text))) AS active_high,
    count(*) FILTER (WHERE ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))) AS active_critical,
    COALESCE(sum(((
        CASE
            WHEN (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text])) THEN 50
            WHEN (ei.impact = ANY (ARRAY['High'::text, 'high'::text])) THEN 30
            WHEN (ei.impact = ANY (ARRAY['Medium'::text, 'medium'::text])) THEN 15
            ELSE 5
        END)::numeric *
        CASE
            WHEN ((ei.escalated_at IS NOT NULL) AND (ei.escalated_at < now())) THEN 1.25
            ELSE 1.0
        END)), (0)::numeric) AS risk_points,
    (COALESCE(count(*) FILTER (WHERE (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text]))), (0)::bigint) > 0) AS has_active_critical,
    true AS data_available
   FROM public.eos_issues ei
  WHERE ((ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL))
  GROUP BY ei.tenant_id;

CREATE VIEW public.v_dashboard_consultant_momentum AS
 SELECT pi.manager_id AS user_uuid,
    pi.tenant_id,
    t.name AS client_name,
    pi.id AS package_instance_id,
    pi.package_id,
    p.name AS package_name,
    COALESCE(cs.overall_score, 0) AS overall_score,
    COALESCE(cs.phase_completion, 0) AS phase_completion,
    COALESCE(cs.risk_health, 100) AS risk_health,
    COALESCE(cs.consult_health, 100) AS consult_health,
    COALESCE(cs.days_stale, 0) AS days_stale,
    COALESCE(cs.is_stale, false) AS is_stale,
    COALESCE(cs.caps_applied, '[]'::jsonb) AS caps_applied,
    GREATEST((0)::numeric, (((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)))::numeric - COALESCE(pi.hours_used, (0)::numeric))) AS hours_remaining,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) THEN 'critical'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL)))) THEN 'at_risk'::text
            ELSE 'on_track'::text
        END AS risk_state,
    cs.calculated_at AS score_calculated_at
   FROM (((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN public.v_compliance_score_latest cs ON (((cs.tenant_id = pi.tenant_id) AND (cs.package_instance_id = pi.id))))
  WHERE ((pi.is_complete = false) AND (pi.manager_id IS NOT NULL))
  ORDER BY
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) THEN 0
            ELSE 1
        END, COALESCE(cs.overall_score, 0) DESC, COALESCE(cs.phase_completion, 0) DESC, GREATEST((0)::numeric, (((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)))::numeric - COALESCE(pi.hours_used, (0)::numeric)));

CREATE VIEW public.v_phase_actions_remaining AS
 WITH current_stage AS (
         SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id) cpss.tenant_id,
            cpss.package_id, cpss.stage_id,
            cpss.status AS stage_status, cpss.sort_order,
            ds.title AS phase_name, ds.stage_key AS phase_key
           FROM (public.client_package_stage_state cpss
             JOIN public.documents_stages ds ON ((ds.id = cpss.stage_id)))
          WHERE ((cpss.is_required = true) AND (cpss.status <> 'complete'::text))
          ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
        ), checklist_counts AS (
         SELECT cpss.tenant_id, cpss.package_id, cs_1.stage_id,
            count(*) FILTER (WHERE ((cpss.status <> 'complete'::text) AND (cpss.is_required = true) AND (cpss.stage_id = cs_1.stage_id))) AS checklist_remaining
           FROM (public.client_package_stage_state cpss
             JOIN current_stage cs_1 ON (((cs_1.tenant_id = cpss.tenant_id) AND (cs_1.package_id = cpss.package_id))))
          WHERE (cpss.stage_id = cs_1.stage_id)
          GROUP BY cpss.tenant_id, cpss.package_id, cs_1.stage_id
        ), doc_counts AS (
         SELECT cs_1.tenant_id, cs_1.package_id, cs_1.stage_id,
            count(*) FILTER (WHERE ((d.document_status IS NULL) OR (d.document_status = 'draft'::text) OR (d.uploaded_files IS NULL) OR (array_length(d.uploaded_files, 1) IS NULL) OR (array_length(d.uploaded_files, 1) = 0))) AS docs_remaining
           FROM (current_stage cs_1
             LEFT JOIN public.documents d ON (((d.tenant_id = cs_1.tenant_id) AND (d.package_id = cs_1.package_id) AND (d.stage = cs_1.stage_id))))
          GROUP BY cs_1.tenant_id, cs_1.package_id, cs_1.stage_id
        ), risk_counts AS (
         SELECT pi_1.tenant_id, pi_1.id AS package_instance_id,
            count(*) FILTER (WHERE ((ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.deleted_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text])))) AS risks_blocking
           FROM (public.package_instances pi_1
             LEFT JOIN public.eos_issues ei ON ((ei.tenant_id = pi_1.tenant_id)))
          WHERE (pi_1.is_complete = false)
          GROUP BY pi_1.tenant_id, pi_1.id
        ), next_milestone AS (
         SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id) cpss.tenant_id, cpss.package_id,
            ds.title AS next_milestone_label
           FROM ((public.client_package_stage_state cpss
             JOIN current_stage cs_1 ON (((cs_1.tenant_id = cpss.tenant_id) AND (cs_1.package_id = cpss.package_id))))
             JOIN public.documents_stages ds ON ((ds.id = cpss.stage_id)))
          WHERE ((cpss.is_required = true) AND (cpss.status <> 'complete'::text) AND (cpss.sort_order > cs_1.sort_order))
          ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
        )
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    t.name AS client_name, p.name AS package_name, p.package_type,
    cs.phase_key, cs.phase_name,
    (COALESCE(cc.checklist_remaining, (0)::bigint))::integer AS checklist_remaining,
    (COALESCE(dc.docs_remaining, (0)::bigint))::integer AS docs_remaining,
    0 AS meetings_remaining, 0 AS approvals_remaining,
    (COALESCE(rc.risks_blocking, (0)::bigint))::integer AS risks_blocking,
    (((COALESCE(cc.checklist_remaining, (0)::bigint) + COALESCE(dc.docs_remaining, (0)::bigint)) + COALESCE(rc.risks_blocking, (0)::bigint)))::integer AS total_actions_remaining,
    nm.next_milestone_label
   FROM (((((((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN current_stage cs ON (((cs.tenant_id = pi.tenant_id) AND (cs.package_id = pi.package_id))))
     LEFT JOIN checklist_counts cc ON (((cc.tenant_id = pi.tenant_id) AND (cc.package_id = pi.package_id))))
     LEFT JOIN doc_counts dc ON (((dc.tenant_id = pi.tenant_id) AND (dc.package_id = pi.package_id))))
     LEFT JOIN risk_counts rc ON (((rc.tenant_id = pi.tenant_id) AND (rc.package_instance_id = pi.id))))
     LEFT JOIN next_milestone nm ON (((nm.tenant_id = pi.tenant_id) AND (nm.package_id = pi.package_id))))
  WHERE (pi.is_complete = false);

CREATE VIEW public.v_momentum_state AS
 WITH last_activity AS (
         SELECT cpss.tenant_id, cpss.package_id,
            max(GREATEST(COALESCE(cpss.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(cpss.completed_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) AS last_activity_at
           FROM public.client_package_stage_state cpss
          GROUP BY cpss.tenant_id, cpss.package_id
        ), current_phase AS (
         SELECT cpss.tenant_id, cpss.package_id, cpss.stage_id, cpss.started_at,
            cpss.updated_at AS phase_last_updated, ds.title AS phase_name,
            (EXTRACT(day FROM (now() - COALESCE(cpss.started_at, cpss.created_at))))::integer AS days_in_phase
           FROM (public.client_package_stage_state cpss
             JOIN public.documents_stages ds ON ((ds.id = cpss.stage_id)))
          WHERE ((cpss.is_required = true) AND (cpss.status <> 'complete'::text) AND (cpss.sort_order = ( SELECT min(cpss2.sort_order) AS min
                   FROM public.client_package_stage_state cpss2
                  WHERE ((cpss2.tenant_id = cpss.tenant_id) AND (cpss2.package_id = cpss.package_id) AND (cpss2.is_required = true) AND (cpss2.status <> 'complete'::text)))))
        ), recent_completion AS (
         SELECT cpss.tenant_id, cpss.package_id,
            max(cpss.completed_at) AS last_completed_at
           FROM public.client_package_stage_state cpss
          WHERE ((cpss.status = 'complete'::text) AND (cpss.completed_at IS NOT NULL))
          GROUP BY cpss.tenant_id, cpss.package_id
        )
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    t.name AS client_name, p.name AS package_name, pi.manager_id,
    COALESCE((EXTRACT(day FROM (now() - la.last_activity_at)))::integer, 999) AS days_since_last_activity,
    COALESCE(cp.days_in_phase, 0) AS days_in_current_phase,
    cp.phase_name AS current_phase_name,
    (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL)))) AS has_unresolved_risk,
    (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) AS has_active_critical,
    array_remove(ARRAY[
        CASE WHEN ((COALESCE((EXTRACT(day FROM (now() - la.last_activity_at)))::integer, 999) > 14) AND ((rc.last_completed_at IS NULL) OR (rc.last_completed_at < (now() - '7 days'::interval)))) THEN 'stale_data'::text ELSE NULL::text END,
        CASE WHEN (cp.days_in_phase > 14) THEN 'phase_stalled'::text ELSE NULL::text END,
        CASE WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text]))))) THEN 'risk_unresolved'::text ELSE NULL::text END
        ], NULL::text) AS pause_reason,
    (((COALESCE((EXTRACT(day FROM (now() - la.last_activity_at)))::integer, 999) > 14) AND ((rc.last_completed_at IS NULL) OR (rc.last_completed_at < (now() - '7 days'::interval)))) OR (cp.days_in_phase > 14) OR (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text])))))) AS is_paused,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) THEN 'at_risk'::text
            WHEN (((COALESCE((EXTRACT(day FROM (now() - la.last_activity_at)))::integer, 999) > 14) AND ((rc.last_completed_at IS NULL) OR (rc.last_completed_at < (now() - '7 days'::interval)))) OR (cp.days_in_phase > 14) OR (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.impact = ANY (ARRAY['High'::text, 'high'::text])))))) THEN 'paused'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.momentum_state_history msh
              WHERE ((msh.tenant_id = pi.tenant_id) AND (msh.package_instance_id = pi.id) AND (msh.state = 'recovered'::text) AND (msh.changed_at > (now() - '24:00:00'::interval))))) THEN 'recovered'::text
            ELSE 'active'::text
        END AS momentum_state,
    ((EXISTS ( SELECT 1
           FROM public.momentum_state_history msh
          WHERE ((msh.tenant_id = pi.tenant_id) AND (msh.package_instance_id = pi.id) AND (msh.state = ANY (ARRAY['paused'::text, 'at_risk'::text])) AND (msh.changed_at > (now() - '30 days'::interval))))) AND (NOT (((COALESCE((EXTRACT(day FROM (now() - la.last_activity_at)))::integer, 999) > 14) AND ((rc.last_completed_at IS NULL) OR (rc.last_completed_at < (now() - '7 days'::interval)))) OR (cp.days_in_phase > 14) OR (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text])))))))) AS recovery_eligible
   FROM (((((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN last_activity la ON (((la.tenant_id = pi.tenant_id) AND (la.package_id = pi.package_id))))
     LEFT JOIN current_phase cp ON (((cp.tenant_id = pi.tenant_id) AND (cp.package_id = pi.package_id))))
     LEFT JOIN recent_completion rc ON (((rc.tenant_id = pi.tenant_id) AND (rc.package_id = pi.package_id))))
  WHERE (pi.is_complete = false);

CREATE VIEW public.v_completion_eligibility AS
 WITH stage_counts AS (
         SELECT cpss.tenant_id, cpss.package_id,
            count(*) FILTER (WHERE (cpss.is_required = true)) AS total_required,
            count(*) FILTER (WHERE ((cpss.is_required = true) AND (cpss.status = 'complete'::text))) AS completed_required
           FROM public.client_package_stage_state cpss
          GROUP BY cpss.tenant_id, cpss.package_id
        ), doc_counts AS (
         SELECT cpss.tenant_id, cpss.package_id,
            count(*) FILTER (WHERE (sd.is_required = true)) AS total_required_docs,
            count(*) FILTER (WHERE ((sd.is_required = true) AND (EXISTS ( SELECT 1
                   FROM public.document_instances di
                  WHERE ((di.document_id = sd.document_id) AND (di.tenant_id = cpss.tenant_id)))))) AS present_required_docs
           FROM (public.client_package_stage_state cpss
             JOIN public.stage_documents sd ON ((sd.stage_id = cpss.stage_id)))
          GROUP BY cpss.tenant_id, cpss.package_id
        )
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    ((COALESCE(sc.total_required, (0)::bigint) > 0) AND (COALESCE(sc.completed_required, (0)::bigint) = COALESCE(sc.total_required, (0)::bigint))) AS is_final_phase_completed,
        CASE WHEN (COALESCE(dc.total_required_docs, (0)::bigint) = 0) THEN 0.0
             ELSE round((1.0 - ((COALESCE(dc.present_required_docs, (0)::bigint))::numeric / (dc.total_required_docs)::numeric)), 2)
        END AS missing_required_docs_ratio,
    (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) AS has_active_critical,
    ((COALESCE(sc.total_required, (0)::bigint) > 0) AND (COALESCE(sc.completed_required, (0)::bigint) = COALESCE(sc.total_required, (0)::bigint)) AND (NOT (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text)))))) AND ((COALESCE(dc.total_required_docs, (0)::bigint) = 0) OR (((COALESCE(dc.present_required_docs, (0)::bigint))::numeric / (NULLIF(dc.total_required_docs, 0))::numeric) >= 0.80))) AS eligible,
    array_remove(ARRAY[
        CASE WHEN (NOT ((COALESCE(sc.total_required, (0)::bigint) > 0) AND (COALESCE(sc.completed_required, (0)::bigint) = COALESCE(sc.total_required, (0)::bigint)))) THEN 'phases_incomplete'::text ELSE NULL::text END,
        CASE WHEN (EXISTS ( SELECT 1
               FROM public.eos_issues ei
              WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) THEN 'active_critical_risk'::text ELSE NULL::text END,
        CASE WHEN ((COALESCE(dc.total_required_docs, (0)::bigint) > 0) AND (((COALESCE(dc.present_required_docs, (0)::bigint))::numeric / (NULLIF(dc.total_required_docs, 0))::numeric) < 0.80)) THEN 'missing_required_docs'::text ELSE NULL::text END
        ], NULL::text) AS ineligible_reasons
   FROM ((public.package_instances pi
     LEFT JOIN stage_counts sc ON (((sc.tenant_id = pi.tenant_id) AND (sc.package_id = pi.package_id))))
     LEFT JOIN doc_counts dc ON (((dc.tenant_id = pi.tenant_id) AND (dc.package_id = pi.package_id))))
  WHERE (pi.is_complete = false);

CREATE VIEW public.v_progress_anchor_inputs AS
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    t.name AS client_name, p.name AS package_name,
    COALESCE(cs.overall_score, 0) AS overall_score,
    COALESCE(cs.days_stale, 0) AS days_stale,
    COALESCE(cs.is_stale, false) AS is_stale,
    (COALESCE(( SELECT count(*) AS count
           FROM public.client_package_stage_state cpss
          WHERE ((cpss.tenant_id = pi.tenant_id) AND (cpss.package_id = pi.package_id) AND (cpss.is_required = true) AND (cpss.status <> 'complete'::text))), (0)::bigint))::integer AS actions_remaining_current_phase,
    (COALESCE(( SELECT count(*) AS count
           FROM (public.stage_documents sd
             JOIN public.client_package_stage_state cpss ON (((cpss.stage_id = sd.stage_id) AND (cpss.tenant_id = pi.tenant_id) AND (cpss.package_id = pi.package_id))))
          WHERE ((sd.is_required = true) AND (NOT (EXISTS ( SELECT 1
                   FROM public.document_instances di
                  WHERE ((di.document_id = sd.document_id) AND (di.tenant_id = pi.tenant_id))))))), (0)::bigint))::integer AS documents_pending_upload,
    ( SELECT ds.title
           FROM (public.client_package_stage_state cpss
             JOIN public.documents_stages ds ON ((ds.id = cpss.stage_id)))
          WHERE ((cpss.tenant_id = pi.tenant_id) AND (cpss.package_id = pi.package_id) AND (cpss.is_required = true) AND (cpss.status <> 'complete'::text))
          ORDER BY cpss.sort_order
         LIMIT 1) AS next_milestone_label,
    (EXISTS ( SELECT 1
           FROM public.eos_issues ei
          WHERE ((ei.tenant_id = pi.tenant_id) AND (ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND ((ei.impact = 'Critical'::text) OR (ei.impact = 'critical'::text))))) AS has_active_critical
   FROM (((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN public.v_compliance_score_latest cs ON (((cs.tenant_id = pi.tenant_id) AND (cs.package_instance_id = pi.id))))
  WHERE (pi.is_complete = false);

CREATE VIEW public.v_predictive_signal_inputs AS
 WITH activity_7d AS (
         SELECT (te.tenant_id)::bigint AS tenant_id, (te.package_id)::bigint AS package_id,
            count(*) AS activity_count_7d
           FROM public.time_entries te
          WHERE (te.start_at >= (now() - '7 days'::interval))
          GROUP BY te.tenant_id, te.package_id
        ), activity_30d AS (
         SELECT (te.tenant_id)::bigint AS tenant_id, (te.package_id)::bigint AS package_id,
            count(*) AS activity_count_30d
           FROM public.time_entries te
          WHERE (te.start_at >= (now() - '30 days'::interval))
          GROUP BY te.tenant_id, te.package_id
        ), stage_activity_7d AS (
         SELECT cpss.tenant_id, cpss.package_id, count(*) AS stage_updates_7d
           FROM public.client_package_stage_state cpss
          WHERE (cpss.updated_at >= (now() - '7 days'::interval))
          GROUP BY cpss.tenant_id, cpss.package_id
        ), stage_activity_30d AS (
         SELECT cpss.tenant_id, cpss.package_id, count(*) AS stage_updates_30d
           FROM public.client_package_stage_state cpss
          WHERE (cpss.updated_at >= (now() - '30 days'::interval))
          GROUP BY cpss.tenant_id, cpss.package_id
        ), new_high_risks_7d AS (
         SELECT ei.tenant_id, count(*) AS new_high_count
           FROM public.eos_issues ei
          WHERE ((ei.deleted_at IS NULL) AND (ei.created_at >= (now() - '7 days'::interval)) AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text])))
          GROUP BY ei.tenant_id
        ), overdue_high_risks AS (
         SELECT ei.tenant_id, count(*) AS overdue_count
           FROM public.eos_issues ei
          WHERE ((ei.deleted_at IS NULL) AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text])) AND (ei.resolved_at IS NULL) AND (ei.impact = ANY (ARRAY['High'::text, 'high'::text])) AND (ei.created_at < (now() - '14 days'::interval)))
          GROUP BY ei.tenant_id
        ), docs_missing_now AS (
         SELECT d.tenant_id, d.package_id,
            count(*) FILTER (WHERE ((d.uploaded_files IS NULL) OR (array_length(d.uploaded_files, 1) IS NULL) OR (array_length(d.uploaded_files, 1) = 0))) AS missing_docs_count
           FROM public.documents d
          GROUP BY d.tenant_id, d.package_id
        ), burn_30d AS (
         SELECT (te.tenant_id)::bigint AS tenant_id, (te.package_id)::bigint AS package_id,
            ((COALESCE(sum(te.duration_minutes), (0)::bigint))::numeric / 60.0) AS hours_used_30d
           FROM public.time_entries te
          WHERE (te.start_at >= (now() - '30 days'::interval))
          GROUP BY te.tenant_id, te.package_id
        ), current_phase AS (
         SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id) cpss.tenant_id, cpss.package_id, cpss.stage_id,
            (EXTRACT(day FROM (now() - COALESCE(cpss.started_at, cpss.created_at))))::integer AS days_in_phase
           FROM public.client_package_stage_state cpss
          WHERE ((cpss.is_required = true) AND (cpss.status <> 'complete'::text))
          ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
        ), actions_remaining AS (
         SELECT v_phase_actions_remaining.tenant_id, v_phase_actions_remaining.package_instance_id,
            v_phase_actions_remaining.package_id, v_phase_actions_remaining.total_actions_remaining
           FROM public.v_phase_actions_remaining
        )
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    t.name AS client_name, p.name AS package_name, pi.manager_id,
    (COALESCE(a7.activity_count_7d, (0)::bigint) + COALESCE(sa7.stage_updates_7d, (0)::bigint)) AS total_activity_7d,
    (COALESCE(a30.activity_count_30d, (0)::bigint) + COALESCE(sa30.stage_updates_30d, (0)::bigint)) AS total_activity_30d,
        CASE WHEN ((COALESCE(a30.activity_count_30d, (0)::bigint) + COALESCE(sa30.stage_updates_30d, (0)::bigint)) = 0) THEN (0)::numeric
             ELSE round((((COALESCE(a7.activity_count_7d, (0)::bigint) + COALESCE(sa7.stage_updates_7d, (0)::bigint)))::numeric / GREATEST((((COALESCE(a30.activity_count_30d, (0)::bigint) + COALESCE(sa30.stage_updates_30d, (0)::bigint)))::numeric / 4.0), (1)::numeric)), 2)
        END AS activity_trend_ratio,
    COALESCE(nhr.new_high_count, (0)::bigint) AS new_high_risks_7d,
    COALESCE(ohr.overdue_count, (0)::bigint) AS overdue_high_risks,
    COALESCE(dm.missing_docs_count, (0)::bigint) AS missing_docs_now,
    COALESCE(b30.hours_used_30d, (0)::numeric) AS hours_used_30d,
    (((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)))::numeric - COALESCE(pi.hours_used, (0)::numeric)) AS remaining_hours,
        CASE WHEN (COALESCE(b30.hours_used_30d, (0)::numeric) > (0)::numeric) THEN round(((((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)))::numeric - COALESCE(pi.hours_used, (0)::numeric)) / (COALESCE(b30.hours_used_30d, (0)::numeric) / 30.0)), 0)
             ELSE (9999)::numeric
        END AS projected_days_to_exhaustion,
    COALESCE(cp.days_in_phase, 0) AS days_in_current_phase,
    COALESCE(ar.total_actions_remaining, 0) AS actions_remaining
   FROM ((((((((((((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN activity_7d a7 ON (((a7.tenant_id = pi.tenant_id) AND (a7.package_id = pi.package_id))))
     LEFT JOIN activity_30d a30 ON (((a30.tenant_id = pi.tenant_id) AND (a30.package_id = pi.package_id))))
     LEFT JOIN stage_activity_7d sa7 ON (((sa7.tenant_id = pi.tenant_id) AND (sa7.package_id = pi.package_id))))
     LEFT JOIN stage_activity_30d sa30 ON (((sa30.tenant_id = pi.tenant_id) AND (sa30.package_id = pi.package_id))))
     LEFT JOIN new_high_risks_7d nhr ON ((nhr.tenant_id = pi.tenant_id)))
     LEFT JOIN overdue_high_risks ohr ON ((ohr.tenant_id = pi.tenant_id)))
     LEFT JOIN docs_missing_now dm ON (((dm.tenant_id = pi.tenant_id) AND (dm.package_id = pi.package_id))))
     LEFT JOIN burn_30d b30 ON (((b30.tenant_id = pi.tenant_id) AND (b30.package_id = pi.package_id))))
     LEFT JOIN current_phase cp ON (((cp.tenant_id = pi.tenant_id) AND (cp.package_id = pi.package_id))))
     LEFT JOIN actions_remaining ar ON (((ar.tenant_id = pi.tenant_id) AND (ar.package_id = pi.package_id))))
  WHERE (pi.is_complete = false);

CREATE VIEW public.v_executive_client_health AS
 SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
    t.name AS client_name, p.name AS package_name, p.package_type,
    t.assigned_consultant_user_id AS owner_user_uuid,
    COALESCE(cs.overall_score, 0) AS overall_score,
    COALESCE(cs.phase_completion, 0) AS phase_completion,
    COALESCE(cs.documentation_coverage, 0) AS documentation_coverage,
    COALESCE(cs.risk_health, 0) AS risk_health,
    COALESCE(cs.consult_health, 0) AS consult_health,
    COALESCE(cs.days_stale, 0) AS days_stale,
    cs.caps_applied,
    cs.calculated_at AS compliance_calculated_at,
    COALESCE(pr.operational_risk_score, 0) AS operational_risk_score,
    COALESCE(pr.risk_band, 'stable'::text) AS risk_band,
    jsonb_build_object('activity_decay', COALESCE(pr.activity_decay, false), 'severe_activity_decay', COALESCE(pr.severe_activity_decay, false), 'risk_escalation', COALESCE(pr.risk_escalation, false), 'backlog_growth', COALESCE(pr.backlog_growth, false), 'sustained_backlog_growth', COALESCE(pr.sustained_backlog_growth, false), 'burn_rate_risk', COALESCE(pr.burn_rate_risk, false), 'phase_drift', COALESCE(pr.phase_drift, false)) AS predictive_flags,
    pr.calculated_at AS predictive_calculated_at,
    COALESCE(ar.total_actions_remaining, 0) AS total_actions_remaining,
    ar.phase_name AS current_phase,
    COALESCE(dp.documents_pending_upload, (0)::bigint) AS documents_pending_upload,
    (COALESCE(rs.active_critical, (0)::bigint) > 0) AS has_active_critical,
    COALESCE(rs.active_risks, (0)::bigint) AS active_risks,
    COALESCE(chr.hours_remaining, (0)::numeric) AS hours_remaining,
    COALESCE(chr.hours_included, 0) AS hours_included,
    COALESCE(cd.delta_overall_score_7d, 0) AS delta_overall_score_7d,
    COALESCE(cd.delta_phase_completion_7d, 0) AS delta_phase_completion_7d,
    COALESCE(cd.delta_docs_coverage_7d, 0) AS delta_docs_coverage_7d,
    COALESCE(cd.delta_risk_health_7d, 0) AS delta_risk_health_7d,
    COALESCE(cd.delta_consult_health_7d, 0) AS delta_consult_health_7d,
    COALESCE(cd.delta_days_stale_7d, 0) AS delta_days_stale_7d,
    COALESCE(rd.delta_operational_risk_7d, 0) AS delta_operational_risk_7d,
    COALESCE(rd.risk_band_change_7d, 'no_baseline'::text) AS risk_band_change_7d,
    cd.t7_calculated_at AS compliance_baseline_at,
    rd.t7_calculated_at AS predictive_baseline_at,
    COALESCE(cd.delta_confidence_7d, 'none'::text) AS delta_confidence_compliance_7d,
    cd.t7_distance_seconds AS t7_distance_seconds_compliance,
    COALESCE(cd.snapshots_last_7d, (0)::bigint) AS snapshots_last_7d_compliance,
    COALESCE(cd.days_since_latest, 0) AS days_since_latest_compliance,
    COALESCE(rd.delta_confidence_7d, 'none'::text) AS delta_confidence_predictive_7d,
    rd.t7_distance_seconds AS t7_distance_seconds_predictive,
    COALESCE(rd.snapshots_last_7d, (0)::bigint) AS snapshots_last_7d_predictive,
    COALESCE(rd.days_since_latest, 0) AS days_since_latest_predictive,
    csp.overall_scores AS compliance_spark_scores,
    csp.days AS compliance_spark_days,
    COALESCE(csp.sparkline_confidence_30d, 'none'::text) AS compliance_spark_confidence,
    psp.risk_scores AS predictive_spark_scores,
    psp.days AS predictive_spark_days,
    COALESCE(psp.sparkline_confidence_30d, 'none'::text) AS predictive_spark_confidence,
    GREATEST(cs.calculated_at, pr.calculated_at) AS updated_at
   FROM ((((((((((((public.package_instances pi
     JOIN public.tenants t ON ((t.id = pi.tenant_id)))
     JOIN public.packages p ON ((p.id = pi.package_id)))
     LEFT JOIN public.v_compliance_score_latest cs ON (((cs.tenant_id = pi.tenant_id) AND (cs.package_instance_id = pi.id))))
     LEFT JOIN public.v_predictive_operational_risk_latest pr ON (((pr.tenant_id = pi.tenant_id) AND (pr.package_instance_id = pi.id))))
     LEFT JOIN public.v_phase_actions_remaining ar ON (((ar.tenant_id = pi.tenant_id) AND (ar.package_instance_id = pi.id))))
     LEFT JOIN public.v_documents_pending dp ON (((dp.tenant_id = pi.tenant_id) AND (dp.package_instance_id = pi.id))))
     LEFT JOIN public.v_client_risk_summary rs ON ((rs.tenant_id = pi.tenant_id)))
     LEFT JOIN public.v_consult_hours_remaining chr ON (((chr.tenant_id = pi.tenant_id) AND (chr.package_instance_id = pi.id))))
     LEFT JOIN public.v_compliance_score_deltas_7d cd ON (((cd.tenant_id = pi.tenant_id) AND (cd.package_instance_id = pi.id))))
     LEFT JOIN public.v_predictive_risk_deltas_7d rd ON (((rd.tenant_id = pi.tenant_id) AND (rd.package_instance_id = pi.id))))
     LEFT JOIN public.v_compliance_sparkline_30d csp ON (((csp.tenant_id = pi.tenant_id) AND (csp.package_instance_id = pi.id))))
     LEFT JOIN public.v_predictive_sparkline_30d psp ON (((psp.tenant_id = pi.tenant_id) AND (psp.package_instance_id = pi.id))))
  WHERE ((pi.is_complete = false) AND (t.status = 'active'::text));

CREATE VIEW public.v_executive_consultant_distribution AS
 SELECT u.user_uuid AS consultant_uuid,
    ((u.first_name || ' '::text) || u.last_name) AS consultant_name,
    count(DISTINCT h.package_instance_id) AS client_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE (h.risk_band = 'immediate_attention'::text)) AS immediate_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE (h.risk_band = 'at_risk'::text)) AS at_risk_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE (h.days_stale > 14)) AS stalled_count,
    round(avg(h.overall_score)) AS avg_score,
    round(avg(h.delta_overall_score_7d)) AS avg_score_delta_7d
   FROM (public.v_executive_client_health h
     JOIN public.users u ON ((u.user_uuid = h.owner_user_uuid)))
  WHERE (h.owner_user_uuid IS NOT NULL)
  GROUP BY u.user_uuid, u.first_name, u.last_name;

-- v_client_risks_actions (no enum casts — verbatim)
CREATE VIEW public.v_client_risks_actions AS
 SELECT ei.id AS issue_id, ei.tenant_id, t.name AS client_name,
    ei.title, ei.item_type, ei.category, ei.status, ei.impact,
    ei.priority, ei.source, ei.created_at, ei.resolved_at,
    ei.escalated_at, ei.quarter_year, ei.quarter_number
   FROM (public.eos_issues ei
     JOIN public.tenants t ON ((t.id = ei.tenant_id)))
  WHERE (ei.deleted_at IS NULL);

-- v_client_eos_summary (no enum casts — verbatim)
CREATE VIEW public.v_client_eos_summary AS
 SELECT t.id AS tenant_id, t.name AS client_name,
    ( SELECT count(*) FROM public.eos_rocks er WHERE (er.tenant_id = t.id)) AS total_rocks,
    ( SELECT count(*) FROM public.eos_rocks er WHERE ((er.tenant_id = t.id) AND (er.status = 'on_track'::text))) AS rocks_on_track,
    ( SELECT count(*) FROM public.eos_rocks er WHERE ((er.tenant_id = t.id) AND (er.status = 'off_track'::text))) AS rocks_off_track,
    ( SELECT count(*) FROM public.eos_rocks er WHERE ((er.tenant_id = t.id) AND (er.status = 'complete'::text))) AS rocks_completed,
    ( SELECT count(*) FROM public.eos_issues ei WHERE ((ei.tenant_id = t.id) AND (ei.deleted_at IS NULL))) AS total_issues,
    ( SELECT count(*) FROM public.eos_issues ei WHERE ((ei.tenant_id = t.id) AND ((ei.status)::text = 'Open'::text) AND (ei.deleted_at IS NULL))) AS open_issues,
    ( SELECT count(*) FROM public.eos_issues ei WHERE ((ei.tenant_id = t.id) AND ((ei.status)::text = 'Solved'::text) AND (ei.deleted_at IS NULL))) AS solved_issues,
    ( SELECT count(*) FROM public.eos_issues ei WHERE ((ei.tenant_id = t.id) AND (ei.item_type = 'Risk'::text) AND (ei.deleted_at IS NULL))) AS risk_count,
    ( SELECT count(*) FROM public.eos_issues ei WHERE ((ei.tenant_id = t.id) AND (ei.item_type = 'Opportunity'::text) AND (ei.deleted_at IS NULL))) AS opportunity_count,
    ( SELECT count(*) FROM public.eos_todos et WHERE (et.tenant_id = t.id)) AS total_todos,
    ( SELECT count(*) FROM public.eos_todos et WHERE ((et.tenant_id = t.id) AND (et.status = 'Complete'::text))) AS completed_todos,
    ( SELECT count(*) FROM public.eos_meetings em WHERE (em.tenant_id = t.id)) AS total_meetings,
    ( SELECT count(*) FROM public.eos_meetings em WHERE ((em.tenant_id = t.id) AND (em.is_complete = true))) AS completed_meetings
   FROM public.tenants t;

-- ============================================================
-- STEP 8: Legacy enum retention
-- ============================================================
COMMENT ON TYPE public.eos_issue_status IS
  'Legacy enum retained for rollback safety. Superseded by dd_eos_issue_status (Phase 5C, 19 May 2026). Do not drop or archive until Phase 5Z — requires Carl/Dave sign-off after documented stable period in production.';

-- ============================================================
-- POST-FLIGHT
-- ============================================================
DO $$
DECLARE
  v_dd_count integer; v_issues_count integer; v_transition_count integer;
  v_fk_count integer; v_enum_exists boolean;
BEGIN
  SELECT COUNT(*) INTO v_dd_count FROM public.dd_eos_issue_status;
  IF v_dd_count <> 8 THEN RAISE EXCEPTION 'Post-flight: expected 8 dd rows, found %', v_dd_count; END IF;

  SELECT COUNT(*) INTO v_issues_count FROM public.eos_issues WHERE status IS NOT NULL;
  IF v_issues_count <> 24 THEN RAISE EXCEPTION 'Post-flight: expected 24 non-null issue rows, found %', v_issues_count; END IF;

  SELECT COUNT(*) INTO v_transition_count FROM public.eos_issue_status_transitions;
  IF v_transition_count <> 19 THEN RAISE EXCEPTION 'Post-flight: expected 19 transition rows, found %', v_transition_count; END IF;

  SELECT COUNT(*) INTO v_fk_count FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'public.dd_eos_issue_status'::regclass;
  IF v_fk_count < 3 THEN RAISE EXCEPTION 'Post-flight: expected >=3 FKs to dd_eos_issue_status, found %', v_fk_count; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'eos_issue_status' AND n.nspname = 'public') INTO v_enum_exists;
  IF NOT v_enum_exists THEN RAISE EXCEPTION 'Post-flight: legacy enum public.eos_issue_status missing'; END IF;

  RAISE NOTICE 'All post-flight checks passed.';
END $$;