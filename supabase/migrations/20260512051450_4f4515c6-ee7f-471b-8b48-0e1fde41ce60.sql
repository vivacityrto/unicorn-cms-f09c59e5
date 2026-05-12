-- harden_function_search_path_batch_1
-- Adds SET search_path to 28 public functions. Bodies copied verbatim from pg_get_functiondef.
-- match_srto_chunks uses 'public', 'extensions' for pgvector operator resolution.

CREATE OR REPLACE FUNCTION public.academy_lesson_set_minutes_from_video()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
DECLARE
  v_duration integer;
BEGIN
  IF NEW.video_id IS NOT NULL THEN
    SELECT duration_seconds INTO v_duration
    FROM public.training_videos
    WHERE id = NEW.video_id;

    IF v_duration IS NOT NULL AND v_duration > 0 THEN
      NEW.estimated_minutes := CEIL(v_duration::numeric / 60.0)::integer;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academy_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.acknowledge_audit_report(p_audit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  UPDATE public.client_audits SET
    report_acknowledged_at = now(),
    report_acknowledged_by = auth.uid()
  WHERE id = p_audit_id
    AND report_client_visible = true
    AND report_acknowledged_at IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_flag_overdue_chcs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  -- Insert a notification record for any client whose CHC is now overdue
  -- and where no active audit is in progress
  INSERT INTO public.notification_schedule (
    tenant_id,
    notification_type,
    payload,
    scheduled_for,
    status
  )
  SELECT
    v.tenant_id,
    'chc_overdue',
    jsonb_build_object(
      'tenant_id',        v.tenant_id,
      'client_name',      v.client_name,
      'rto_id',           v.rto_id,
      'last_audit_id',    v.last_audit_id,
      'last_conducted',   v.last_conducted_at,
      'days_overdue',     ABS(v.days_until_due),
      'schedule_status',  v.schedule_status
    ),
    now(),
    'pending'
  FROM public.v_audit_schedule v
  WHERE v.schedule_status = 'overdue'
    AND v.active_audit_id IS NULL
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_notify_docs_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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
    body    := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
    )
  );

  UPDATE public.client_audits
  SET ai_analysis_status = 'pending'
  WHERE id = v_audit_id
    AND ai_analysis_status = 'none';

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_send_24hr_confirmation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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
      body    := v_payload::text,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
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
 SET search_path = 'public'
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
        body    := v_payload::text,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
        )
      );
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.coerce_audit_appointment_attendees()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.attendees IS NULL THEN
    NEW.attendees := '[]'::jsonb;
  END IF;
  IF NEW.duration_minutes IS NULL THEN
    NEW.duration_minutes := 60;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compare_unicorn_import_prefix(prefix text DEFAULT '0212_'::text)
 RETURNS TABLE(source_table text, target_table text, source_rows bigint, target_rows bigint, source_max_id bigint, target_max_id bigint, notes text)
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
declare
  r record;
  src_tbl text;
  tgt_tbl text;
  src_rows bigint;
  tgt_rows bigint;
  src_max bigint;
  tgt_max bigint;
  note text;
  tgt_exists boolean;
  src_has_id boolean;
  tgt_has_id boolean;
begin
  for r in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'unicorn1'
      and t.table_type = 'BASE TABLE'
      and t.table_name like prefix || '%'
    order by t.table_name
  loop
    src_tbl := r.table_name;
    tgt_tbl := replace(r.table_name, prefix, '');

    note := null;

    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tgt_tbl
    ) into tgt_exists;

    if not tgt_exists then
      note := coalesce(note || '; ', '') || 'missing public table';
      src_rows := null; tgt_rows := null; src_max := null; tgt_max := null;

      select exists (
        select 1 from information_schema.columns
        where table_schema = 'unicorn1' and table_name = src_tbl and column_name = 'id'
      ) into src_has_id;

      execute format('select count(*)::bigint from unicorn1.%I', src_tbl) into src_rows;

      if src_has_id then
        execute format('select max(id)::bigint from unicorn1.%I', src_tbl) into src_max;
      else
        note := coalesce(note || '; ', '') || 'source has no id';
      end if;

      source_table := 'unicorn1.' || src_tbl;
      target_table := 'public.' || tgt_tbl;
      source_rows := src_rows;
      target_rows := null;
      source_max_id := src_max;
      target_max_id := null;
      notes := note;
      return next;
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'unicorn1' and table_name = src_tbl and column_name = 'id'
    ) into src_has_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tgt_tbl and column_name = 'id'
    ) into tgt_has_id;

    execute format('select count(*)::bigint from unicorn1.%I', src_tbl) into src_rows;
    execute format('select count(*)::bigint from public.%I', tgt_tbl) into tgt_rows;

    if src_has_id then
      execute format('select max(id)::bigint from unicorn1.%I', src_tbl) into src_max;
    else
      src_max := null;
      note := coalesce(note || '; ', '') || 'source has no id';
    end if;

    if tgt_has_id then
      execute format('select max(id)::bigint from public.%I', tgt_tbl) into tgt_max;
    else
      tgt_max := null;
      note := coalesce(note || '; ', '') || 'target has no id';
    end if;

    source_table := 'unicorn1.' || src_tbl;
    target_table := 'public.' || tgt_tbl;
    source_rows := src_rows;
    target_rows := tgt_rows;
    source_max_id := src_max;
    target_max_id := tgt_max;
    notes := note;

    return next;
  end loop;

  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_audit_stage_tasks(p_audit_id uuid, p_milestone text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_stage_instance_id bigint;
  v_stage_id          integer;
  v_count             integer := 0;
  v_task_ids          bigint[];
BEGIN
  SELECT si.id, s.stage_id
  INTO v_stage_instance_id, v_stage_id
  FROM public.client_audits ca
  JOIN public.stage_instances si ON si.id = ca.linked_stage_instance_id
  JOIN public.package_stages s  ON s.stage_id = si.stage_id
  WHERE ca.id = p_audit_id
  LIMIT 1;

  IF v_stage_instance_id IS NULL THEN
    SELECT si.id, si.stage_id
    INTO v_stage_instance_id, v_stage_id
    FROM public.client_audits ca
    JOIN public.stage_instances si ON si.id = ca.linked_stage_instance_id
    WHERE ca.id = p_audit_id
    LIMIT 1;
  END IF;

  IF v_stage_instance_id IS NULL THEN RETURN 0; END IF;

  v_task_ids := CASE
    WHEN v_stage_id = 24 AND p_milestone = 'scheduled' THEN
      ARRAY[6489, 5343]::bigint[]
    WHEN v_stage_id = 24 AND p_milestone = 'evidence_sent' THEN
      ARRAY[3268, 182, 6871, 183]::bigint[]
    WHEN v_stage_id = 24 AND p_milestone = 'docs_notified' THEN
      ARRAY[6668, 6663]::bigint[]
    WHEN v_stage_id = 24 AND p_milestone = 'conducted' THEN
      ARRAY[6913]::bigint[]
    WHEN v_stage_id = 24 AND p_milestone = 'report_released' THEN
      ARRAY[187]::bigint[]

    WHEN v_stage_id = 5 AND p_milestone = 'scheduled' THEN
      ARRAY[210]::bigint[]
    WHEN v_stage_id = 5 AND p_milestone = 'evidence_sent' THEN
      ARRAY[97]::bigint[]
    WHEN v_stage_id = 5 AND p_milestone = 'conducted' THEN
      ARRAY[1241]::bigint[]
    WHEN v_stage_id = 5 AND p_milestone = 'report_released' THEN
      ARRAY[208]::bigint[]

    WHEN v_stage_id = 1106 AND p_milestone = 'scheduled' THEN
      ARRAY[6862, 6863]::bigint[]
    WHEN v_stage_id = 1106 AND p_milestone = 'report_released' THEN
      ARRAY[6864]::bigint[]

    WHEN v_stage_id = 6 AND p_milestone = 'scheduled' THEN
      ARRAY[24, 64]::bigint[]

    ELSE ARRAY[]::bigint[]
  END;

  UPDATE public.staff_task_instances sti
  SET
    status          = 'complete',
    completion_date = now(),
    completed_by    = auth.uid(),
    notes           = COALESCE(notes || E'\n', '') ||
      '[Auto-completed by audit module — ' || p_milestone || ' — ' ||
      to_char(now(), 'DD Mon YYYY HH24:MI') || ']'
  WHERE sti.stageinstance_id = v_stage_instance_id
    AND sti.stafftask_id     = ANY(v_task_ids)
    AND sti.status           != 'complete';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_milestone = 'conducted' THEN
    UPDATE public.stage_instances SET event_conducted_date = CURRENT_DATE
    WHERE id = v_stage_instance_id AND event_conducted_date IS NULL;
  END IF;

  IF p_milestone = 'report_released' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.staff_task_instances sti
      JOIN public.staff_tasks st ON st.id = sti.stafftask_id
      WHERE sti.stageinstance_id = v_stage_instance_id
        AND st.is_core = true
        AND sti.status != 'complete'
    ) THEN
      UPDATE public.stage_instances
      SET status = 'complete', completion_date = CURRENT_DATE
      WHERE id = v_stage_instance_id AND status != 'complete';
    END IF;
  END IF;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_chc_stage_tasks(p_audit_id uuid, p_milestone text)
 RETURNS integer
 LANGUAGE sql
 SET search_path = 'public'
AS $function$
  SELECT public.complete_audit_stage_tasks(p_audit_id, p_milestone);
$function$;

CREATE OR REPLACE FUNCTION public.compliance_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_certificate_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
DECLARE
  seq_val bigint;
  year_str text;
BEGIN
  seq_val := nextval('academy_certificate_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'VA-' || year_str || '-' || lpad(seq_val::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_code_tables()
 RETURNS TABLE(table_name text, schema_name text, row_count bigint, has_rls boolean, policy_count integer, columns jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_user_role text;
  rec record;
  v_count bigint;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE user_uuid = auth.uid();
  IF v_user_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  FOR rec IN
    SELECT
      t.table_name::text AS tname,
      t.table_schema::text AS sname,
      COALESCE(c.relrowsecurity, false) AS rls,
      COALESCE(
        (SELECT count(*)::int FROM pg_catalog.pg_policies p WHERE p.tablename = t.table_name AND p.schemaname = 'public'),
        0
      ) AS pcnt,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'column_name', cols.column_name,
          'data_type', cols.data_type,
          'is_nullable', cols.is_nullable,
          'column_default', cols.column_default
        ) ORDER BY cols.ordinal_position)
        FROM information_schema.columns cols
        WHERE cols.table_name = t.table_name AND cols.table_schema = 'public'),
        '[]'::jsonb
      ) AS cols
    FROM information_schema.tables t
    LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (t.table_name LIKE 'dd_%' OR t.table_name = 'app_settings')
    ORDER BY t.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', rec.tname) INTO v_count;
    table_name := rec.tname;
    schema_name := rec.sname;
    row_count := v_count;
    has_rls := rec.rls;
    policy_count := rec.pcnt;
    columns := rec.cols;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_srto_chunks(query_embedding extensions.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 8, filter_source_type srto_source_type DEFAULT NULL::srto_source_type, filter_clause text DEFAULT NULL::text, filter_framework text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, chunk_index integer, source_document text, source_type srto_source_type, framework text, clause text, quality_area text, heading text, content text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path = 'public', 'extensions'
AS $function$
  select
    c.id,
    c.chunk_index,
    c.source_document,
    c.source_type,
    c.framework,
    c.clause,
    c.quality_area,
    c.heading,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.srto_corpus c
  where (filter_source_type is null or c.source_type = filter_source_type)
    and (filter_clause      is null or c.clause      = filter_clause)
    and (filter_framework   is null or c.framework   = filter_framework)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$function$;

CREATE OR REPLACE FUNCTION public.normalise_abn(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = 'public'
AS $function$
  SELECT lpad(regexp_replace(coalesce(p,''), '[^0-9]', '', 'g'), 11, '0')
$function$;

CREATE OR REPLACE FUNCTION public.normalise_name(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = 'public'
AS $function$
  SELECT regexp_replace(lower(trim(coalesce(p,''))), '\s+', ' ', 'g')
$function$;

CREATE OR REPLACE FUNCTION public.release_audit_report(p_audit_id uuid, p_released_by uuid, p_release_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_tenant_id        bigint;
  v_report_path      text;
  v_file_name        text;
  v_portal_doc_id    uuid;
  v_audit_title      text;
BEGIN
  SELECT subject_tenant_id, report_pdf_path,
         COALESCE(title, 'Audit Report'), doc_number
  INTO v_tenant_id, v_report_path, v_audit_title, v_file_name
  FROM public.client_audits
  WHERE id = p_audit_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Audit not found');
  END IF;

  IF v_report_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No report PDF has been generated yet');
  END IF;

  INSERT INTO public.portal_documents (
    tenant_id,
    storage_path,
    file_name,
    file_type,
    direction,
    is_client_visible,
    status,
    source,
    linked_audit_id,
    description,
    uploaded_by,
    uploaded_at,
    shared_at,
    shared_by
  ) VALUES (
    v_tenant_id,
    v_report_path,
    COALESCE(v_file_name, 'Compliance Health Check Report') || '.pdf',
    'application/pdf',
    'outbound',
    true,
    'active',
    'audit_report',
    p_audit_id,
    COALESCE(p_release_notes, 'Compliance audit report'),
    p_released_by,
    now(),
    now(),
    p_released_by
  )
  RETURNING id INTO v_portal_doc_id;

  UPDATE public.client_audits SET
    report_client_visible  = true,
    report_released_at     = now(),
    report_released_by     = p_released_by,
    report_release_notes   = p_release_notes
  WHERE id = p_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'portal_document_id', v_portal_doc_id,
    'released_at', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_match_clickup_to_rto_membership()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_matched int := 0;
  v_unmatched int := 0;
  v_no_entries int := 0;
  rec record;
  v_earliest date;
  v_pi_id bigint;
  v_pi_count int;
BEGIN
  FOR rec IN
    SELECT cta.id AS cta_id, cta.task_id, cta.tenant_id
    FROM clickup_tasks_api cta
    WHERE cta.tenant_id IS NOT NULL
      AND cta.packageinstance_id IS NULL
  LOOP
    SELECT MIN(cte.start_at::date) INTO v_earliest
    FROM clickup_time_entries cte
    WHERE cte.task_id = rec.task_id;

    IF v_earliest IS NULL THEN
      v_no_entries := v_no_entries + 1;
      CONTINUE;
    END IF;

    SELECT COUNT(*), MIN(pi.id)
    INTO v_pi_count, v_pi_id
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = rec.tenant_id
      AND p.name LIKE 'M-%R%'
      AND v_earliest >= pi.start_date
      AND v_earliest < (pi.start_date + interval '1 year');

    IF v_pi_count = 1 THEN
      UPDATE clickup_tasks_api
      SET packageinstance_id = v_pi_id
      WHERE id = rec.cta_id;
      v_matched := v_matched + 1;
    ELSE
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'unmatched', v_unmatched,
    'no_entries', v_no_entries
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_audit_phase(p_audit_id uuid, p_appointment_type text, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_duration_minutes integer DEFAULT 60, p_location text DEFAULT NULL::text, p_is_online boolean DEFAULT true, p_meeting_url text DEFAULT NULL::text, p_attendees jsonb DEFAULT '[]'::jsonb, p_client_instructions text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_tenant_id       bigint;
  v_audit_title     text;
  v_appt_id         uuid;
  v_entry_id        uuid;
  v_entry_title     text;
  v_entry_desc      text;
BEGIN
  SELECT subject_tenant_id, COALESCE(title, 'Compliance Audit')
  INTO v_tenant_id, v_audit_title
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
    attendees             = EXCLUDED.attendees,
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
  END IF;

  RETURN v_appt_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_audit_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_default_renewal_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.next_renewal_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.next_renewal_date := NEW.start_date + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.suggest_items_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_audit_actions_to_client_items(p_audit_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_tenant_id bigint;
  v_audit_title text;
  v_count integer := 0;
  r record;
BEGIN
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

CREATE OR REPLACE FUNCTION public.sync_primary_contact_on_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.relationship_role = 'primary_contact' THEN
    NEW.primary_contact   := true;
    NEW.secondary_contact := false;
  ELSIF NEW.relationship_role = 'secondary_contact' THEN
    NEW.primary_contact   := false;
    NEW.secondary_contact := true;
  ELSIF NEW.relationship_role IN ('user','academy_user') THEN
    NEW.primary_contact   := false;
    NEW.secondary_contact := false;
  ELSE
    IF NEW.role = 'parent'
       AND COALESCE(NEW.primary_contact, false) = false THEN
      NEW.primary_contact := true;
    END IF;
    IF COALESCE(NEW.primary_contact, false)
       AND COALESCE(NEW.secondary_contact, false) THEN
      NEW.secondary_contact := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_video_refresh_lesson_minutes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
     AND NEW.duration_seconds IS NOT NULL
     AND NEW.duration_seconds > 0 THEN
    UPDATE public.academy_lessons
    SET estimated_minutes = CEIL(NEW.duration_seconds::numeric / 60.0)::integer,
        updated_at = now()
    WHERE video_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_normalise_tenant_identifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.identifier_type = 'abn' THEN
    NEW.identifier_value := public.normalise_abn(NEW.identifier_value);
    IF length(NEW.identifier_value) <> 11 THEN
      RAISE EXCEPTION 'ABN must be exactly 11 digits after normalisation';
    END IF;
  ELSE
    NEW.identifier_value := trim(NEW.identifier_value);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_validate_action_item_priority_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.priority IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = NEW.priority AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid priority: %. Must be one of the values in dd_priority.', NEW.priority;
    END IF;
  END IF;

  IF NEW.status IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.dd_action_status WHERE value = NEW.status AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid status: %. Must be one of the values in dd_action_status.', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;