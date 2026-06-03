CREATE OR REPLACE FUNCTION public.set_issue_status(p_issue_id uuid, p_status text, p_solution_text text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_issue RECORD;
  v_user_id uuid := auth.uid();
  v_old_status text;
  v_active_meeting_id uuid;
  v_resolved_tenant_id bigint;
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
    WHERE (v_issue.tenant_id IS NULL OR m.tenant_id = v_issue.tenant_id)
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

  v_resolved_tenant_id := COALESCE(
    v_issue.tenant_id,
    (SELECT tenant_id FROM public.eos_meetings WHERE id = v_issue.meeting_id)
  );

  IF v_resolved_tenant_id IS NOT NULL THEN
    INSERT INTO public.audit_eos_events (tenant_id, entity, entity_id, action, user_id, details)
    VALUES (
      v_resolved_tenant_id, 'issue', p_issue_id, 'status_change', v_user_id,
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', p_status,
        'meeting_linked', v_issue.meeting_id IS NOT NULL
      )
    );
  END IF;
END;
$function$;