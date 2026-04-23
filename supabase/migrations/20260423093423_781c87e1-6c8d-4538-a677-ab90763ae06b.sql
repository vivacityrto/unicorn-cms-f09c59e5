-- Helper: derive a regulatory stream tag for a package from its name/slug.
-- Returns 'rto' | 'cricos' | 'gto' | 'generic'.
CREATE OR REPLACE FUNCTION public.fn_package_stream(p_package_id bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_slug text;
  v_norm text;
BEGIN
  SELECT upper(coalesce(name,'')), upper(coalesce(slug,''))
    INTO v_name, v_slug
    FROM packages
   WHERE id = p_package_id;

  IF v_name IS NULL THEN
    RETURN 'generic';
  END IF;

  v_norm := v_name || ' ' || v_slug;

  -- GTO: explicit token wins over RTO (because "GTO" doesn't contain "RTO")
  IF v_norm ~ '(^|[-_/ ])GTO([-_/ ]|$)' THEN
    RETURN 'gto';
  END IF;

  -- CRICOS: full word, abbreviated "CRI", or membership suffix tier+C (e.g. M-RC, M-DC, M-GC, M-SAC)
  IF v_norm ~ '(^|[-_/ ])CRICOS([-_/ ]|$)'
     OR v_norm ~ '(^|[-_/ ])CRI([-_/ ]|$)'
     OR v_name ~ '^M-[A-Z]+C$' THEN
    RETURN 'cricos';
  END IF;

  -- RTO: full word, or membership suffix tier+R (e.g. M-RR, M-DR, M-GR, M-SAR)
  IF v_norm ~ '(^|[-_/ ])RTO([-_/ ]|$)'
     OR v_name ~ '^M-[A-Z]+R$' THEN
    RETURN 'rto';
  END IF;

  RETURN 'generic';
END;
$$;

-- Updated start_client_package: adds duplicate-type-with-stream guard before insert.
CREATE OR REPLACE FUNCTION public.start_client_package(
  p_tenant_id bigint,
  p_package_id bigint,
  p_assigned_csc_user_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_instance_id bigint;
  v_included_minutes integer;
  v_pkg_type text;
  v_pkg_name text;
  v_stream text;
  v_existing_name text;
  v_existing_stream text;
  v_stage RECORD;
  v_stage_instance_id bigint;
BEGIN
  -- Resolve package metadata
  SELECT COALESCE(total_hours, 0) * 60, package_type, name
    INTO v_included_minutes, v_pkg_type, v_pkg_name
    FROM packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', p_package_id;
  END IF;

  v_stream := public.fn_package_stream(p_package_id);

  -- Duplicate-type guard: block a second active stand-alone package of the
  -- same package_type unless the streams are different and both non-generic.
  -- (Add-ons with parent_instance_id IS NOT NULL are exempt.)
  SELECT p.name, public.fn_package_stream(p.id)
    INTO v_existing_name, v_existing_stream
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
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

  -- 1. Insert into package_instances
  INSERT INTO package_instances (
    tenant_id,
    package_id,
    start_date,
    is_complete,
    is_active,
    clo_id,
    manager_id,
    included_minutes
  ) VALUES (
    p_tenant_id,
    p_package_id,
    CURRENT_DATE,
    false,
    true,
    0,
    p_assigned_csc_user_id,
    v_included_minutes
  )
  RETURNING id INTO v_package_instance_id;

  -- 2. Loop through package_stages for this package
  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM package_stages ps
     WHERE ps.package_id = p_package_id
     ORDER BY ps.sort_order
  LOOP
    INSERT INTO stage_instances (
      stage_id,
      packageinstance_id,
      stage_sortorder,
      status_id,
      status,
      is_recurring
    ) VALUES (
      v_stage.stage_id::integer,
      v_package_instance_id,
      v_stage.sort_order,
      0,
      'Not Started',
      v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    INSERT INTO staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'Not Started'
      FROM staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id,
           v_stage_instance_id,
           0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
      FROM documents d
     WHERE d.stage = v_stage.stage_id::integer;

  END LOOP;

  -- 3. Audit log
  INSERT INTO client_audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) VALUES (
    p_tenant_id,
    auth.uid(),
    'package_started',
    'package_instances',
    v_package_instance_id::text,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id,
      'stream', v_stream
    )
  );

  RETURN v_package_instance_id;
END;
$function$;