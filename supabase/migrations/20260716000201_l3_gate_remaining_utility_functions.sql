
-- L3 (16 Jul 2026 addendum): spot-check pass over the "likely low-risk
-- internal/seed/utility" cluster. Most of these are genuinely low-risk
-- (idempotent seed jobs, simple counters) and are left as-is per the
-- addendum's own triage. Five turned out to have real, fixable gaps:
--
-- fn_queue_broadcast_campaign -- HIGH. Any authenticated user could queue a
-- draft marketing/comms campaign for real mass-send to its full recipient
-- list. Gate: staff-only.
-- emit_notification -- no in-DB callers found; looks like an internal event
-- emitter meant to be invoked by triggers/edge functions, not the browser.
-- Any authenticated user could currently queue an arbitrary notification to
-- any recipient with attacker-controlled payload/record refs. REVOKE from
-- authenticated/anon (service_role/postgres unaffected).
-- seed_eos_accountability_chart -- any authenticated user could seed a chart
-- for any tenant_id and forge p_created_by. Gate: staff-only + force
-- created_by from auth.uid().
-- rpc_match_clickup_to_rto_membership -- platform-wide bulk matching job,
-- no params. Low direct-harm but shouldn't be user-triggerable. Gate:
-- staff-only.
-- stall_bulk_document_job -- any authenticated user could stall (DoS) any
-- tenant's running bulk document job by guessing a job id. Gate: staff-only.

create or replace function public.fn_queue_broadcast_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_status text;
  v_target_mode text;
  v_package_type text;
  v_include_roles text[];
  v_count integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT status, target_mode, package_type, include_roles
  INTO v_status, v_target_mode, v_package_type, v_include_roles
  FROM broadcast_campaigns
  WHERE id = p_campaign_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF v_status != 'draft' THEN
    RAISE EXCEPTION 'Campaign must be in draft status to queue (current: %)', v_status;
  END IF;

  INSERT INTO broadcast_recipients (campaign_id, tenant_id, user_id)
  SELECT p_campaign_id, r.tenant_id, r.user_id
  FROM fn_preview_broadcast_recipients(v_target_mode, v_package_type, v_include_roles) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No recipients matched the targeting criteria';
  END IF;

  UPDATE broadcast_campaigns
  SET status = 'queued',
      total_recipients = v_count
  WHERE id = p_campaign_id;
END;
$function$;

create or replace function public.seed_eos_accountability_chart(p_tenant_id integer, p_created_by uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_chart_id uuid;
  v_leadership_func_id uuid;
  v_operations_func_id uuid;
  v_client_success_func_id uuid;
  v_sales_func_id uuid;
  v_finance_func_id uuid;
  v_marketing_func_id uuid;
  v_visionary_seat_id uuid;
  v_integrator_seat_id uuid;
  v_lt_member_seat_id uuid;
  v_ops_lead_seat_id uuid;
  v_cs_lead_seat_id uuid;
  v_sales_lead_seat_id uuid;
  v_finance_lead_seat_id uuid;
  v_marketing_lead_seat_id uuid;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  p_created_by := auth.uid();

  INSERT INTO public.accountability_charts (tenant_id, status, created_by)
  VALUES (p_tenant_id, 'Draft', p_created_by)
  RETURNING id INTO v_chart_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Leadership Team', 'leadership', 0)
  RETURNING id INTO v_leadership_func_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Operations', 'operations', 1)
  RETURNING id INTO v_operations_func_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Client Success', 'delivery', 2)
  RETURNING id INTO v_client_success_func_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Sales & Growth', 'sales_marketing', 3)
  RETURNING id INTO v_sales_func_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Finance & Admin', 'finance', 4)
  RETURNING id INTO v_finance_func_id;

  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Marketing', 'sales_marketing', 5)
  RETURNING id INTO v_marketing_func_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type,
    is_required_for_quorum, critical_seat, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Visionary', 'visionary',
    true, true, 0
  )
  RETURNING id INTO v_visionary_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type,
    is_required_for_quorum, critical_seat, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Integrator', 'integrator',
    true, true, 1
  )
  RETURNING id INTO v_integrator_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type,
    is_required_for_quorum, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Leadership Team Member', 'leadership_team',
    true, 2
  )
  RETURNING id INTO v_lt_member_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_operations_func_id, v_chart_id, p_tenant_id, 'Operations Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_ops_lead_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_client_success_func_id, v_chart_id, p_tenant_id, 'Client Success Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_cs_lead_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_sales_func_id, v_chart_id, p_tenant_id, 'Sales Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_sales_lead_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_finance_func_id, v_chart_id, p_tenant_id, 'Finance Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_finance_lead_seat_id;

  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_marketing_func_id, v_chart_id, p_tenant_id, 'Marketing Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_marketing_lead_seat_id;

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_visionary_seat_id, p_tenant_id, 'Sets vision and long-term direction', 0),
    (v_visionary_seat_id, p_tenant_id, 'Maintains culture and core values', 1),
    (v_visionary_seat_id, p_tenant_id, 'Drives key relationships and partnerships', 2),
    (v_visionary_seat_id, p_tenant_id, 'Defines priorities and communicates focus', 3);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_integrator_seat_id, p_tenant_id, 'Runs day-to-day operations', 0),
    (v_integrator_seat_id, p_tenant_id, 'Aligns leadership team execution', 1),
    (v_integrator_seat_id, p_tenant_id, 'Owns accountability for results', 2),
    (v_integrator_seat_id, p_tenant_id, 'Resolves cross-functional issues', 3);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_lt_member_seat_id, p_tenant_id, 'Owns function outcomes', 0),
    (v_lt_member_seat_id, p_tenant_id, 'Brings and solves issues', 1),
    (v_lt_member_seat_id, p_tenant_id, 'Leads people and execution', 2);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_ops_lead_seat_id, p_tenant_id, 'Service delivery consistency', 0),
    (v_ops_lead_seat_id, p_tenant_id, 'Capacity and resourcing health', 1),
    (v_ops_lead_seat_id, p_tenant_id, 'Process adherence and improvement', 2);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_cs_lead_seat_id, p_tenant_id, 'Client delivery outcomes', 0),
    (v_cs_lead_seat_id, p_tenant_id, 'Renewal risk and escalation control', 1),
    (v_cs_lead_seat_id, p_tenant_id, 'Client communication cadence', 2);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_sales_lead_seat_id, p_tenant_id, 'Pipeline health', 0),
    (v_sales_lead_seat_id, p_tenant_id, 'Close performance', 1),
    (v_sales_lead_seat_id, p_tenant_id, 'Handover quality into delivery', 2);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_finance_lead_seat_id, p_tenant_id, 'Cashflow and forecasting', 0),
    (v_finance_lead_seat_id, p_tenant_id, 'Billing and collections hygiene', 1),
    (v_finance_lead_seat_id, p_tenant_id, 'Reporting accuracy', 2);

  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_marketing_lead_seat_id, p_tenant_id, 'Lead generation programs', 0),
    (v_marketing_lead_seat_id, p_tenant_id, 'Brand presence and messaging', 1),
    (v_marketing_lead_seat_id, p_tenant_id, 'Campaign tracking and reporting', 2);

  RETURN v_chart_id;
END;
$function$;

create or replace function public.rpc_match_clickup_to_rto_membership()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_matched int := 0;
  v_unmatched int := 0;
  v_no_entries int := 0;
  rec record;
  v_earliest date;
  v_pi_id bigint;
  v_pi_count int;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

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

create or replace function public.stall_bulk_document_job(p_job_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.bulk_document_jobs
     SET status = 'stalled',
         error_summary = COALESCE(error_summary, '{}'::jsonb) || jsonb_build_object(
           'stalled_reason', p_reason,
           'stalled_at', now()
         )
   WHERE id = p_job_id AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

revoke execute on function public.emit_notification(text, uuid, text, uuid, jsonb, integer, integer) from authenticated, anon;

NOTIFY pgrst, 'reload schema';
