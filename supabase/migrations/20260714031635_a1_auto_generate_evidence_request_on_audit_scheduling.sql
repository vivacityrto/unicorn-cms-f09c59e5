-- A1 (Unicorn 2.0 Feature Status report, §4): when the "document submission
-- deadline" appointment is scheduled for an audit, auto-generate the
-- evidence_requests + evidence_request_items record from
-- stage_required_evidence_categories, instead of CSCs building it by hand
-- and manually emailing the client. audit_send_evidence_reminders() and
-- audit_notify_docs_ready() already exist and will pick this request up
-- automatically once due_date/status are set.
--
-- Idempotent: re-scheduling the same appointment (e.g. moving the deadline)
-- updates the existing request rather than creating a duplicate.
CREATE OR REPLACE FUNCTION public.schedule_audit_phase(p_audit_id uuid, p_appointment_type text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_duration_minutes integer DEFAULT 60, p_location text DEFAULT NULL::text, p_is_online boolean DEFAULT true, p_meeting_url text DEFAULT NULL::text, p_attendees jsonb DEFAULT '[]'::jsonb, p_client_instructions text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- A1: auto-generate (or update) the pre-audit evidence request.
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
      -- Re-scheduling: keep the existing request/items, just move the deadline.
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