
-- ============================================================
-- Phase B: RPC writers + dd_status 'closed' seed
-- ============================================================

-- Seed 'closed' into dd_status (code 7, seq 5).
INSERT INTO public.dd_status (code, value, description, seq)
VALUES (7, 'closed', 'Closed', 5)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- complete_audit_stage_tasks: change 'complete' -> 'completed'
-- on stage_instances writes only. Child task writes unchanged (D4).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_audit_stage_tasks(
  p_audit_id uuid,
  p_milestone text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    WHEN v_stage_id = 24   AND p_milestone = 'scheduled'        THEN ARRAY[6489, 5343]::bigint[]
    WHEN v_stage_id = 24   AND p_milestone = 'evidence_sent'    THEN ARRAY[3268, 182, 6871, 183]::bigint[]
    WHEN v_stage_id = 24   AND p_milestone = 'docs_notified'    THEN ARRAY[6668, 6663]::bigint[]
    WHEN v_stage_id = 24   AND p_milestone = 'conducted'        THEN ARRAY[6913]::bigint[]
    WHEN v_stage_id = 24   AND p_milestone = 'report_released'  THEN ARRAY[187]::bigint[]
    WHEN v_stage_id = 5    AND p_milestone = 'scheduled'        THEN ARRAY[210]::bigint[]
    WHEN v_stage_id = 5    AND p_milestone = 'evidence_sent'    THEN ARRAY[97]::bigint[]
    WHEN v_stage_id = 5    AND p_milestone = 'conducted'        THEN ARRAY[1241]::bigint[]
    WHEN v_stage_id = 5    AND p_milestone = 'report_released'  THEN ARRAY[208]::bigint[]
    WHEN v_stage_id = 1106 AND p_milestone = 'scheduled'        THEN ARRAY[6862, 6863]::bigint[]
    WHEN v_stage_id = 1106 AND p_milestone = 'report_released'  THEN ARRAY[6864]::bigint[]
    WHEN v_stage_id = 6    AND p_milestone = 'scheduled'        THEN ARRAY[24, 64]::bigint[]
    ELSE ARRAY[]::bigint[]
  END;

  -- staff_task_instances child writes kept on legacy 'complete' per D4.
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
      SET status = 'completed', completion_date = CURRENT_DATE
      WHERE id = v_stage_instance_id
        AND status != 'completed';
    END IF;
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_audit_stage_tasks(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_audit_stage_tasks(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- start_client_package: write canonical 'not_started'; remove
-- status_id assignment; fully schema-qualify body.
-- Child instance writes (staff/client/email/document) unchanged (D4).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_client_package(
  p_tenant_id bigint,
  p_package_id bigint,
  p_assigned_csc_user_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_package_instance_id bigint;
  v_included_minutes integer;
  v_pkg_type text;
  v_pkg_name text;
  v_pkg_slug text;
  v_stream text;
  v_existing_name text;
  v_existing_stream text;
  v_billing_type text;
  v_billing_category text;
  v_stage RECORD;
  v_stage_instance_id bigint;
BEGIN
  SELECT COALESCE(total_hours, 0) * 60, package_type, name, slug
    INTO v_included_minutes, v_pkg_type, v_pkg_name, v_pkg_slug
    FROM public.packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', p_package_id;
  END IF;

  v_stream := public.fn_package_stream(p_package_id);

  IF v_pkg_name LIKE 'KS%' OR v_pkg_name LIKE 'KickStart%' OR v_pkg_slug LIKE '%ks%' THEN
    v_billing_type := 'non_billable'; v_billing_category := NULL;
  ELSIF v_pkg_name LIKE 'M-GTO%' THEN
    v_billing_type := 'billable'; v_billing_category := 'other';
  ELSIF v_pkg_name LIKE 'M-%' AND (
      v_pkg_slug LIKE '%-rc' OR v_pkg_slug LIKE '%-gc'
      OR v_pkg_slug LIKE '%-dc' OR v_pkg_slug LIKE '%-sac'
      OR v_pkg_slug LIKE '%-bc'
  ) THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_cricos';
  ELSIF v_pkg_name LIKE 'M-%' THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_rto';
  ELSE
    v_billing_type := 'billable'; v_billing_category := 'other';
  END IF;

  SELECT p.name, public.fn_package_stream(p.id)
    INTO v_existing_name, v_existing_stream
    FROM public.package_instances pi
    JOIN public.packages p ON p.id = pi.package_id
   WHERE pi.tenant_id = p_tenant_id
     AND pi.is_complete = false
     AND pi.parent_instance_id IS NULL
     AND COALESCE(pi.membership_state, 'active') <> 'cancelled'
     AND p.package_type = v_pkg_type
     AND (
           public.fn_package_stream(p.id) = 'generic'
        OR v_stream = 'generic'
        OR public.fn_package_stream(p.id) = v_stream
     )
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_PACKAGE_TYPE: tenant % already has an active % (% stream) package: %. Cancel or complete it first.',
      p_tenant_id, v_pkg_type, v_existing_stream, v_existing_name
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.package_instances (
    tenant_id, package_id, start_date, is_complete, is_active, clo_id,
    manager_id, included_minutes, billing_type, billing_category
  ) VALUES (
    p_tenant_id, p_package_id, CURRENT_DATE, false, true, 0,
    p_assigned_csc_user_id, v_included_minutes, v_billing_type, v_billing_category
  )
  RETURNING id INTO v_package_instance_id;

  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = p_package_id
     ORDER BY ps.sort_order
  LOOP
    -- Phase B: canonical text, no status_id write.
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, v_package_instance_id, v_stage.sort_order,
      'not_started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    -- Child writes unchanged (D4).
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'Not Started'
      FROM public.staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id, v_stage_instance_id, 0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM public.client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM public.emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer;
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, auth.uid(), 'package_started', 'package_instances',
    v_package_instance_id::text,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id,
      'stream', v_stream,
      'billing_type', v_billing_type,
      'billing_category', v_billing_category
    )
  );

  RETURN v_package_instance_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_client_package(bigint, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_client_package(bigint, bigint, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- repair_package_instance_stages: same writer fix on stage_instances.
-- Child writes unchanged (D4).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_package_instance_stages(
  p_package_instance_id bigint,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pkg_id bigint;
  v_tenant_id bigint;
  v_template_total int;
  v_present int;
  v_stage RECORD;
  v_stage_instance_id bigint;
  v_inserted_ids bigint[] := ARRAY[]::bigint[];
  v_missing jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege: staff-only operation' USING ERRCODE = '42501';
  END IF;

  SELECT pi.package_id, pi.tenant_id
    INTO v_pkg_id, v_tenant_id
    FROM public.package_instances pi
   WHERE pi.id = p_package_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_instance % not found', p_package_instance_id;
  END IF;

  SELECT count(*) INTO v_template_total FROM public.package_stages ps
   WHERE ps.package_id = v_pkg_id;

  SELECT count(*) INTO v_present FROM public.stage_instances si
   WHERE si.packageinstance_id = p_package_instance_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'stage_id', ps.stage_id, 'name', s.name, 'sort_order', ps.sort_order
         ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_missing
    FROM public.package_stages ps
    LEFT JOIN public.stages s ON s.id = ps.stage_id::int
   WHERE ps.package_id = v_pkg_id
     AND NOT EXISTS (
       SELECT 1 FROM public.stage_instances si
        WHERE si.packageinstance_id = p_package_instance_id
          AND si.stage_id = ps.stage_id::int
     );

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'package_instance_id', p_package_instance_id, 'package_id', v_pkg_id,
      'tenant_id', v_tenant_id, 'template_total', v_template_total,
      'present', v_present, 'missing', v_missing, 'dry_run', true
    );
  END IF;

  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = v_pkg_id
       AND NOT EXISTS (
         SELECT 1 FROM public.stage_instances si
          WHERE si.packageinstance_id = p_package_instance_id
            AND si.stage_id = ps.stage_id::int
       )
     ORDER BY ps.sort_order
  LOOP
    -- Phase B: canonical text, no status_id write.
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, p_package_instance_id, v_stage.sort_order,
      'not_started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    v_inserted_ids := v_inserted_ids || v_stage_instance_id;

    -- Child writes unchanged (D4).
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'Not Started'
      FROM public.staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id, v_stage_instance_id, 0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM public.client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM public.emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, v_tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer;
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    v_tenant_id, auth.uid(), 'package_stages_repaired', 'package_instances',
    p_package_instance_id::text,
    jsonb_build_object(
      'inserted_stage_instance_ids', v_inserted_ids,
      'inserted_count', array_length(v_inserted_ids, 1),
      'template_total', v_template_total,
      'missing_before', v_missing
    )
  );

  RETURN jsonb_build_object(
    'package_instance_id', p_package_instance_id, 'package_id', v_pkg_id,
    'tenant_id', v_tenant_id, 'template_total', v_template_total,
    'inserted_count', COALESCE(array_length(v_inserted_ids, 1), 0),
    'inserted_stage_instance_ids', v_inserted_ids, 'dry_run', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.repair_package_instance_stages(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_package_instance_stages(bigint, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
