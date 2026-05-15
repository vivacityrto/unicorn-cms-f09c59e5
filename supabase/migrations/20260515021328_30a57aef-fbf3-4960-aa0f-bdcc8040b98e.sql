CREATE OR REPLACE FUNCTION public.audit_send_24hr_confirmation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_tomorrow date := CURRENT_DATE + 1;
  v_payload jsonb;
BEGIN
  FOR r IN
    SELECT
      aa.id               AS appt_id,
      aa.scheduled_start_time,
      aa.meeting_url,
      aa.teams_join_url,
      aa.location,
      aa.is_online,
      aa.client_instructions,
      ca.id               AS audit_id,
      ca.title            AS audit_title,
      ca.snapshot_rto_name,
      ca.snapshot_ceo,
      ca.snapshot_email,
      ca.subject_tenant_id,
      u.first_name || ' ' || u.last_name AS auditor_name,
      u.email             AS auditor_email
    FROM public.audit_appointments aa
    JOIN public.client_audits ca ON ca.id = aa.audit_id
    LEFT JOIN public.users u ON u.user_uuid = ca.lead_auditor_id
    WHERE aa.appointment_type = 'opening_meeting'
      AND aa.status = 'scheduled'
      AND aa.scheduled_date = v_tomorrow
  LOOP
    v_payload := jsonb_build_object(
      'audit_id',       r.audit_id,
      'appt_id',        r.appt_id,
      'rto_name',       r.snapshot_rto_name,
      'ceo_name',       COALESCE(r.snapshot_ceo, 'Team'),
      'client_email',   r.snapshot_email,
      'tenant_id',      r.subject_tenant_id,
      'meeting_time',   LEFT(r.scheduled_start_time::text, 5),
      'meeting_url',    COALESCE(r.meeting_url, r.teams_join_url),
      'location',       r.location,
      'is_online',      r.is_online,
      'instructions',   r.client_instructions,
      'auditor_name',   r.auditor_name,
      'auditor_email',  r.auditor_email,
      'automation',     'audit_24hr_confirmation'
    );

    PERFORM net.http_post(
      url     := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-automated-email',
      body    := v_payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      )
    );

    INSERT INTO public.notification_schedule (
      tenant_id, notification_type, payload, scheduled_for, status
    ) VALUES (
      r.subject_tenant_id, 'audit_24hr_confirmation', v_payload, now(), 'sent'
    ) ON CONFLICT DO NOTHING;

  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_send_evidence_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r         record;
  v_payload jsonb;
  v_outstanding_count integer;
  v_outstanding_items text;
BEGIN
  FOR r IN
    SELECT
      er.id               AS request_id,
      er.title            AS request_title,
      er.due_date,
      er.audit_id,
      er.tenant_id,
      ca.snapshot_rto_name,
      ca.snapshot_ceo,
      ca.snapshot_email,
      u.first_name || ' ' || u.last_name AS auditor_name,
      u.email             AS auditor_email,
      (er.due_date - CURRENT_DATE) AS days_left
    FROM public.evidence_requests er
    JOIN public.client_audits ca ON ca.id = er.audit_id
    LEFT JOIN public.users u ON u.user_uuid = ca.lead_auditor_id
    WHERE er.audit_id IS NOT NULL
      AND er.status = 'sent'
      AND er.due_date IN (CURRENT_DATE + 1, CURRENT_DATE + 3)
  LOOP
    SELECT
      COUNT(*),
      STRING_AGG('• ' || item_name, E'\n' ORDER BY display_order)
    INTO v_outstanding_count, v_outstanding_items
    FROM public.evidence_request_items
    WHERE request_id = r.request_id
      AND status NOT IN ('received','accepted');

    IF v_outstanding_count > 0 THEN
      v_payload := jsonb_build_object(
        'audit_id',           r.audit_id,
        'request_id',         r.request_id,
        'rto_name',           r.snapshot_rto_name,
        'ceo_name',           COALESCE(r.snapshot_ceo, 'Team'),
        'client_email',       r.snapshot_email,
        'tenant_id',          r.tenant_id,
        'days_left',          r.days_left,
        'outstanding_count',  v_outstanding_count,
        'outstanding_items',  COALESCE(v_outstanding_items, ''),
        'auditor_name',       r.auditor_name,
        'auditor_email',      r.auditor_email,
        'automation',         'audit_evidence_reminder'
      );

      PERFORM net.http_post(
        url     := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-automated-email',
        body    := v_payload,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || private.cron_function_jwt()
        )
      );
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_notify_docs_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total    integer;
  v_received integer;
  v_audit_id uuid;
  v_payload  jsonb;
  v_rto_name text;
  v_auditor_email text;
  v_auditor_name  text;
  v_opening_at    timestamptz;
BEGIN
  IF NEW.status NOT IN ('received','accepted') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('received','accepted') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.evidence_request_items
  WHERE request_id = NEW.request_id;

  SELECT COUNT(*) INTO v_received
  FROM public.evidence_request_items
  WHERE request_id = NEW.request_id
    AND status IN ('received','accepted');

  IF v_received < v_total THEN
    RETURN NEW;
  END IF;

  SELECT
    er.audit_id,
    ca.snapshot_rto_name,
    ca.opening_meeting_at,
    u.email,
    u.first_name || ' ' || u.last_name
  INTO v_audit_id, v_rto_name, v_opening_at, v_auditor_email, v_auditor_name
  FROM public.evidence_requests er
  JOIN public.client_audits ca ON ca.id = er.audit_id
  LEFT JOIN public.users u ON u.user_uuid = ca.lead_auditor_id
  WHERE er.id = NEW.request_id;

  IF v_audit_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'audit_id',        v_audit_id,
    'request_id',      NEW.request_id,
    'rto_name',        v_rto_name,
    'items_received',  v_received,
    'items_total',     v_total,
    'auditor_email',   v_auditor_email,
    'auditor_name',    v_auditor_name,
    'opening_meeting', v_opening_at,
    'automation',      'audit_docs_ready'
  );

  PERFORM net.http_post(
    url     := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-automated-email',
    body    := v_payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.cron_function_jwt()
    )
  );

  UPDATE public.client_audits
  SET ai_analysis_status = 'pending'
  WHERE id = v_audit_id
    AND ai_analysis_status = 'none';

  RETURN NEW;
END;
$function$;