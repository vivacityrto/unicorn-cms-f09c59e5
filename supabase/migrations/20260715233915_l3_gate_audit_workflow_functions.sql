
-- L3 (16 Jul 2026 Unicorn security audit addendum): audit-workflow cluster,
-- in-body permission checks. All three previously had zero caller-identity
-- validation despite being SECURITY DEFINER and EXECUTE-granted to
-- authenticated, and two of the three trusted a caller-supplied identity
-- parameter for attribution.

-- calculate_compliance_score: real caller is tenant-facing UI
-- (useComplianceScore). Previously any authenticated user could pass an
-- arbitrary p_tenant_id/p_package_instance_id to compute and PERSIST a
-- compliance-score snapshot (phase completion, doc coverage, risk health,
-- consult hours usage -- a real cross-tenant confidentiality leak) for a
-- tenant they have no relationship to, and could spoof
-- p_actor_user_uuid to forge who triggered it. Fix: require tenant access
-- (client of that tenant) or Vivacity staff, and always derive the actor
-- from auth.uid() rather than the caller-supplied parameter.
create or replace function public.calculate_compliance_score(
  p_tenant_id bigint,
  p_package_instance_id bigint,
  p_actor_user_uuid uuid DEFAULT NULL::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_package_id bigint;
  v_total_stages int;
  v_completed_stages int;
  v_phase_completion int;
  v_total_required_docs int;
  v_present_docs int;
  v_documentation_coverage int;
  v_risk_points numeric;
  v_risk_health int;
  v_hours_included numeric;
  v_hours_used numeric;
  v_hours_added numeric;
  v_total_hours numeric;
  v_usage numeric;
  v_consult_health int;
  v_last_activity timestamptz;
  v_days_stale int;
  v_stale_cap int;
  v_overall_score numeric;
  v_caps_applied jsonb;
  v_critical_risk_count int;
  v_missing_ratio numeric;
  v_current_phase_pct int;
  v_snapshot_id uuid;
  v_result jsonb;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF NOT (public.has_tenant_access_safe(p_tenant_id, v_caller) OR public.is_vivacity_team_safe(v_caller)) THEN
    RETURN jsonb_build_object('error', 'Forbidden');
  END IF;

  -- Actor attribution always comes from the authenticated caller, never the
  -- (previously trusted) parameter.
  p_actor_user_uuid := v_caller;

  SELECT package_id INTO v_package_id
  FROM package_instances
  WHERE id = p_package_instance_id AND tenant_id = p_tenant_id;

  IF v_package_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Package instance not found');
  END IF;

  v_caps_applied := '[]'::jsonb;

  SELECT
    COUNT(*) FILTER (WHERE is_required = true),
    COUNT(*) FILTER (WHERE is_required = true AND status = 'complete')
  INTO v_total_stages, v_completed_stages
  FROM client_package_stage_state
  WHERE tenant_id = p_tenant_id AND package_id = v_package_id;

  IF v_total_stages = 0 THEN
    v_phase_completion := 0;
  ELSE
    v_phase_completion := LEAST(100, ROUND((v_completed_stages::numeric / v_total_stages) * 100));
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE sd.is_required = true),
    COUNT(*) FILTER (WHERE sd.is_required = true AND di.id IS NOT NULL)
  INTO v_total_required_docs, v_present_docs
  FROM stage_documents sd
  JOIN package_stages ps ON ps.stage_id = sd.stage_id AND ps.package_id = v_package_id
  LEFT JOIN document_instances di ON di.document_id = sd.document_id AND di.tenant_id = p_tenant_id;

  IF v_total_required_docs = 0 THEN
    v_documentation_coverage := 100;
  ELSE
    v_documentation_coverage := LEAST(100, ROUND((v_present_docs::numeric / v_total_required_docs) * 100));
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN impact = 'Critical' THEN 50
      WHEN impact = 'High' OR impact = 'high' THEN 30
      WHEN impact = 'Medium' OR impact = 'medium' THEN 15
      ELSE 5
    END
    * CASE WHEN status != 'Closed' AND resolved_at IS NULL THEN 1.0 ELSE 0.0 END
    * CASE WHEN status != 'Closed' AND resolved_at IS NULL
              AND escalated_at IS NOT NULL AND escalated_at < now() THEN 1.25 ELSE 1.0 END
  ), 0)
  INTO v_risk_points
  FROM eos_issues
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  v_risk_health := GREATEST(0, LEAST(100, ROUND(100 - (v_risk_points / 100.0) * 100)));

  SELECT COUNT(*)
  INTO v_critical_risk_count
  FROM eos_issues
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND status != 'Closed'
    AND resolved_at IS NULL
    AND (impact = 'Critical' OR impact = 'critical');

  SELECT
    COALESCE(hours_included, 0),
    COALESCE(hours_used, 0),
    COALESCE(hours_added, 0)
  INTO v_hours_included, v_hours_used, v_hours_added
  FROM package_instances
  WHERE id = p_package_instance_id AND tenant_id = p_tenant_id;

  v_total_hours := v_hours_included + v_hours_added;

  IF v_total_hours = 0 THEN
    v_consult_health := 100;
  ELSE
    v_usage := v_hours_used / v_total_hours;
    IF v_usage <= 0.85 THEN
      v_consult_health := 100;
    ELSIF v_usage <= 1.0 THEN
      v_consult_health := ROUND(100 - ((v_usage - 0.85) / 0.15) * 30);
    ELSIF v_usage <= 1.2 THEN
      v_consult_health := ROUND(70 - ((v_usage - 1.0) / 0.2) * 40);
    ELSE
      v_consult_health := 0;
    END IF;
  END IF;

  v_consult_health := GREATEST(0, LEAST(100, v_consult_health));

  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM client_package_stage_state WHERE tenant_id = p_tenant_id AND package_id = v_package_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(di.updated_at) FROM document_instances di WHERE di.tenant_id = p_tenant_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM eos_issues WHERE tenant_id = p_tenant_id AND deleted_at IS NULL), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM time_entries WHERE tenant_id = p_tenant_id::int AND package_id = v_package_id::int), '1970-01-01'::timestamptz)
  ) INTO v_last_activity;

  v_days_stale := EXTRACT(DAY FROM (now() - v_last_activity))::int;

  IF v_days_stale <= 14 THEN
    v_stale_cap := 100;
  ELSIF v_days_stale <= 30 THEN
    v_stale_cap := 85;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 85, 'days', v_days_stale);
  ELSIF v_days_stale <= 60 THEN
    v_stale_cap := 70;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 70, 'days', v_days_stale);
  ELSE
    v_stale_cap := 50;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 50, 'days', v_days_stale);
  END IF;

  v_overall_score := 0.40 * v_phase_completion
                   + 0.25 * v_documentation_coverage
                   + 0.25 * v_risk_health
                   + 0.10 * v_consult_health;

  IF v_critical_risk_count > 0 THEN
    v_overall_score := LEAST(v_overall_score, 60);
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'critical_risk', 'cap', 60, 'count', v_critical_risk_count);
  END IF;

  IF v_total_required_docs > 0 THEN
    v_missing_ratio := 1.0 - (v_present_docs::numeric / v_total_required_docs);
    IF v_missing_ratio > 0.20 THEN
      v_overall_score := LEAST(v_overall_score, 70);
      v_caps_applied := v_caps_applied || jsonb_build_object('type', 'missing_docs', 'cap', 70, 'missing_pct', ROUND(v_missing_ratio * 100));
    END IF;
  END IF;

  v_current_phase_pct := v_phase_completion;
  IF v_current_phase_pct < 60 AND v_total_stages > 0 THEN
    v_overall_score := LEAST(v_overall_score, 75);
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'phase_lock', 'cap', 75, 'pct', v_current_phase_pct);
  END IF;

  v_overall_score := LEAST(v_overall_score, v_stale_cap);
  v_overall_score := GREATEST(0, LEAST(100, ROUND(v_overall_score)));

  INSERT INTO compliance_score_snapshots (
    tenant_id, package_instance_id,
    phase_completion, documentation_coverage, risk_health, consult_health,
    overall_score, days_stale, caps_applied, inputs,
    calculated_by_user_uuid
  ) VALUES (
    p_tenant_id, p_package_instance_id,
    v_phase_completion, v_documentation_coverage, v_risk_health, v_consult_health,
    v_overall_score::int, v_days_stale, v_caps_applied,
    jsonb_build_object(
      'total_stages', v_total_stages,
      'completed_stages', v_completed_stages,
      'total_required_docs', v_total_required_docs,
      'present_docs', v_present_docs,
      'risk_points', v_risk_points,
      'hours_included', v_hours_included,
      'hours_used', v_hours_used,
      'hours_added', v_hours_added,
      'critical_risk_count', v_critical_risk_count,
      'last_activity', v_last_activity
    ),
    p_actor_user_uuid
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'compliance_score',
    v_snapshot_id::text,
    'compliance_score_calculated',
    p_actor_user_uuid,
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'package_instance_id', p_package_instance_id,
      'overall_score', v_overall_score,
      'trigger', 'user_triggered'
    )
  );

  v_result := jsonb_build_object(
    'id', v_snapshot_id,
    'overall_score', v_overall_score,
    'phase_completion', v_phase_completion,
    'documentation_coverage', v_documentation_coverage,
    'risk_health', v_risk_health,
    'consult_health', v_consult_health,
    'days_stale', v_days_stale,
    'caps_applied', v_caps_applied,
    'inputs', jsonb_build_object(
      'total_stages', v_total_stages,
      'completed_stages', v_completed_stages,
      'total_required_docs', v_total_required_docs,
      'present_docs', v_present_docs,
      'risk_points', v_risk_points,
      'hours_included', v_hours_included,
      'hours_used', v_hours_used,
      'hours_added', v_hours_added,
      'critical_risk_count', v_critical_risk_count,
      'last_activity', v_last_activity
    )
  );

  RETURN v_result;
END;
$function$;

-- schedule_audit_phase: real caller is staff UI (useAuditSchedule). Previously
-- any authenticated user could reschedule any tenant's audit meetings and spoof
-- p_created_by. Fix: staff-only gate, derive created_by from auth.uid().
create or replace function public.schedule_audit_phase(
  p_audit_id uuid,
  p_appointment_type text,
  p_scheduled_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_duration_minutes integer DEFAULT 60,
  p_location text DEFAULT NULL::text,
  p_is_online boolean DEFAULT true,
  p_meeting_url text DEFAULT NULL::text,
  p_attendees jsonb DEFAULT '[]'::jsonb,
  p_client_instructions text DEFAULT NULL::text,
  p_internal_notes text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_tenant_id       bigint;
  v_audit_title     text;
  v_audit_created_by uuid;
  v_appt_id         uuid;
  v_entry_id        uuid;
  v_entry_title     text;
  v_entry_desc      text;
  v_request_id      uuid;
  v_requested_by    uuid;
  v_item_count      integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  p_created_by := auth.uid();

  SELECT subject_tenant_id, COALESCE(title, 'Compliance Audit'), created_by
  INTO v_tenant_id, v_audit_title, v_audit_created_by
  FROM public.client_audits WHERE id = p_audit_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Audit not found: %', p_audit_id;
  END IF;

  v_entry_title := CASE p_appointment_type
    WHEN 'document_submission_deadline' THEN 'Evidence due: ' || v_audit_title
    WHEN 'opening_meeting'              THEN 'Opening meeting: ' || v_audit_title
    WHEN 'document_review'             THEN 'Document review: ' || v_audit_title
    WHEN 'closing_meeting'             THEN 'Closing meeting: ' || v_audit_title
    ELSE v_audit_title
  END;

  v_entry_desc := COALESCE(p_client_instructions, v_entry_title);

  INSERT INTO public.calendar_entries (
    title, description, entry_date, entry_time,
    tenant_id, created_by
  ) VALUES (
    v_entry_title, v_entry_desc,
    p_scheduled_date, p_start_time,
    v_tenant_id, p_created_by
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.audit_appointments (
    audit_id, appointment_type,
    scheduled_date, scheduled_start_time, scheduled_end_time,
    duration_minutes, location, is_online, meeting_url,
    attendees, client_instructions, internal_notes,
    calendar_entry_id, status, created_by
  ) VALUES (
    p_audit_id, p_appointment_type,
    p_scheduled_date, p_start_time, p_end_time,
    p_duration_minutes, p_location, p_is_online, p_meeting_url,
    p_attendees, p_client_instructions, p_internal_notes,
    v_entry_id, 'scheduled', p_created_by
  )
  ON CONFLICT (audit_id, appointment_type)
  DO UPDATE SET
    scheduled_date        = EXCLUDED.scheduled_date,
    scheduled_start_time  = EXCLUDED.scheduled_start_time,
    scheduled_end_time    = EXCLUDED.scheduled_end_time,
    duration_minutes      = EXCLUDED.duration_minutes,
    location              = EXCLUDED.location,
    is_online             = EXCLUDED.is_online,
    meeting_url           = EXCLUDED.meeting_url,
    attendees              = EXCLUDED.attendees,
    client_instructions   = EXCLUDED.client_instructions,
    internal_notes        = EXCLUDED.internal_notes,
    calendar_entry_id     = v_entry_id,
    status                = 'scheduled',
    updated_at            = now()
  RETURNING id INTO v_appt_id;

  IF p_appointment_type = 'opening_meeting' THEN
    UPDATE public.client_audits SET
      opening_meeting_at = (p_scheduled_date || ' ' || p_start_time)::timestamptz,
      audit_location     = p_location,
      audit_is_online    = p_is_online
    WHERE id = p_audit_id;
  ELSIF p_appointment_type = 'closing_meeting' THEN
    UPDATE public.client_audits SET
      closing_meeting_at = (p_scheduled_date || ' ' || p_start_time)::timestamptz
    WHERE id = p_audit_id;
  ELSIF p_appointment_type = 'document_submission_deadline' THEN
    UPDATE public.client_audits SET
      document_deadline_at = p_scheduled_date
    WHERE id = p_audit_id;

    v_requested_by := COALESCE(p_created_by, v_audit_created_by);

    SELECT id INTO v_request_id
    FROM public.evidence_requests
    WHERE audit_id = p_audit_id
    LIMIT 1;

    IF v_request_id IS NULL AND v_requested_by IS NOT NULL THEN
      INSERT INTO public.evidence_requests (
        tenant_id, title, description, due_date, category,
        requested_by_user_id, status, sent_at, audit_id
      ) VALUES (
        v_tenant_id,
        'Pre-audit evidence: ' || v_audit_title,
        'Auto-generated on scheduling. Please upload the items below before the audit document deadline.',
        p_scheduled_date,
        'audit_preparation',
        v_requested_by,
        'sent',
        now(),
        p_audit_id
      )
      RETURNING id INTO v_request_id;

      INSERT INTO public.evidence_request_items (
        request_id, item_name, guidance_text, is_required, display_order
      )
      SELECT
        v_request_id,
        sec.category_name,
        sec.category_description || COALESCE(' (' || sec.related_standard_clause || ')', ''),
        sec.mandatory_flag,
        row_number() OVER (ORDER BY sec.mandatory_flag DESC, sec.category_name)
      FROM public.stage_required_evidence_categories sec
      WHERE sec.stage_type = 'default';
    ELSIF v_request_id IS NOT NULL THEN
      UPDATE public.evidence_requests
      SET due_date = p_scheduled_date,
          status = CASE WHEN status IN ('closed','cancelled') THEN status ELSE 'sent' END,
          sent_at = COALESCE(sent_at, now()),
          updated_at = now()
      WHERE id = v_request_id;
    END IF;
  END IF;

  RETURN v_appt_id;
END;
$function$;

-- sync_audit_actions_to_client_items: real caller is staff UI (action
-- plan / complete). Previously any authenticated user could trigger this for
-- any audit_id with no relationship to that tenant. Fix: staff-only gate.
create or replace function public.sync_audit_actions_to_client_items(p_audit_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_tenant_id bigint;
  v_audit_title text;
  v_count integer := 0;
  r record;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT subject_tenant_id, COALESCE(title, 'Audit action')
  INTO v_tenant_id, v_audit_title
  FROM public.client_audits
  WHERE id = p_audit_id;

  IF v_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.client_audit_actions
    WHERE audit_id = p_audit_id
      AND client_action_item_id IS NULL
      AND status NOT IN ('cancelled')
  LOOP
    INSERT INTO public.client_action_items (
      tenant_id, title, description, due_date,
      priority, status, source, related_entity_type, related_entity_id,
      item_type, created_by
    ) VALUES (
      v_tenant_id::integer,
      r.title,
      COALESCE(r.description, 'From audit: ' || v_audit_title),
      r.due_date,
      r.priority,
      'open',
      'audit',
      'client_audit',
      p_audit_id::text,
      'action',
      r.created_by
    )
    RETURNING id INTO r.client_action_item_id;

    UPDATE public.client_audit_actions
    SET client_action_item_id = r.client_action_item_id
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

NOTIFY pgrst, 'reload schema';
