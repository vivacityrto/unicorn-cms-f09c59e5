
-- Step 1: table
CREATE TABLE public.document_stage_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  stage_id integer NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (document_id, stage_id)
);

CREATE INDEX idx_document_stage_links_document_id ON public.document_stage_links(document_id);
CREATE INDEX idx_document_stage_links_stage_id ON public.document_stage_links(stage_id);

REVOKE ALL ON public.document_stage_links FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_stage_links TO authenticated;
GRANT ALL ON public.document_stage_links TO service_role;

ALTER TABLE public.document_stage_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_stage_links_select" ON public.document_stage_links
  FOR SELECT USING (public.is_super_admin_safe(auth.uid()) OR public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "document_stage_links_staff_write" ON public.document_stage_links
  FOR ALL USING (public.is_super_admin_safe(auth.uid()) OR public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()) OR public.is_vivacity_team_safe(auth.uid()));

-- Step 3a: publish_stage_version
CREATE OR REPLACE FUNCTION public.publish_stage_version(p_stage_id bigint, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_stage record;
  v_snapshot jsonb;
  v_team_tasks jsonb;
  v_client_tasks jsonb;
  v_emails jsonb;
  v_documents jsonb;
  v_next_version int;
  v_version_id uuid;
  v_si record;
BEGIN
  SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found'; END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.stage_versions WHERE stage_id = p_stage_id;

  v_snapshot := jsonb_build_object(
    'stage', jsonb_build_object(
      'id', v_stage.id, 'name', v_stage.name, 'type', v_stage.stage_type,
      'description', v_stage.description, 'ai_hint', v_stage.ai_hint,
      'is_certified', v_stage.is_certified, 'certified_notes', v_stage.certified_notes
    )
  );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'sort_order', order_number, 'is_core', is_core,
      'is_key_event', is_key_event, 'due_date_offset', due_date_offset,
      'is_recurring', is_recurring
    ) ORDER BY order_number
  ), '[]'::jsonb) INTO v_team_tasks
  FROM public.staff_tasks WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('team_tasks', v_team_tasks);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'instructions', instructions, 'sort_order', sort_order,
      'due_date_offset', due_date_offset, 'is_mandatory', is_mandatory
    ) ORDER BY sort_order
  ), '[]'::jsonb) INTO v_client_tasks
  FROM public.client_tasks WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('client_tasks', v_client_tasks);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'subject', subject,
      'description', description, 'sort_order', order_number,
      'is_core', is_core
    ) ORDER BY order_number
  ), '[]'::jsonb) INTO v_emails
  FROM public.emails WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('emails', v_emails);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', d.id, 'document_id', d.id,
      'visibility', 'both', 'delivery_type', 'manual',
      'sort_order', 0, 'document_name', d.title,
      'is_core', false, 'is_active', true,
      'is_required', false
    ) ORDER BY d.title
  ), '[]'::jsonb) INTO v_documents
  FROM public.documents d
  WHERE d.stage = p_stage_id
     OR EXISTS (
       SELECT 1 FROM public.document_stage_links dsl
       WHERE dsl.document_id = d.id AND dsl.stage_id = p_stage_id
     );
  v_snapshot := v_snapshot || jsonb_build_object('documents', v_documents);

  INSERT INTO public.stage_versions (stage_id, version_number, status, notes, snapshot, created_by)
  VALUES (p_stage_id, v_next_version, 'published', p_notes, v_snapshot, auth.uid())
  RETURNING id INTO v_version_id;

  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('publish', 'stage_version', v_version_id, auth.uid(),
    jsonb_build_object('stage_id', p_stage_id, 'version', v_next_version, 'notes', p_notes));

  FOR v_si IN
    SELECT si.id AS stage_instance_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    WHERE si.stage_id = p_stage_id AND pi.is_complete = false
  LOOP
    -- Phase SB: canonical text for staff_task_instances.
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status, is_core)
    SELECT st.id, v_si.stage_instance_id, 0, 'not_started', st.is_core
    FROM public.staff_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_task_instances sti
        WHERE sti.stageinstance_id = v_si.stage_instance_id AND sti.stafftask_id = st.id
      );

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status)
    SELECT ct.id, v_si.stage_instance_id, 0
    FROM public.client_tasks ct
    WHERE ct.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.client_task_instances cti
        WHERE cti.stageinstance_id = v_si.stage_instance_id AND cti.clienttask_id = ct.id
      );

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, document_title)
    SELECT d.id, v_si.stage_instance_id,
      (SELECT pi2.tenant_id FROM public.package_instances pi2
       JOIN public.stage_instances si2 ON si2.packageinstance_id = pi2.id
       WHERE si2.id = v_si.stage_instance_id LIMIT 1),
      'pending',
      d.title
    FROM public.documents d
    WHERE (d.stage = p_stage_id
       OR EXISTS (
         SELECT 1 FROM public.document_stage_links dsl
         WHERE dsl.document_id = d.id AND dsl.stage_id = p_stage_id
       ))
      AND NOT EXISTS (
        SELECT 1 FROM public.document_instances di
        WHERE di.stageinstance_id = v_si.stage_instance_id AND di.document_id = d.id
      );
  END LOOP;

  RETURN v_version_id;
END;
$function$;

-- Step 3b: repair_package_instance_stages
CREATE OR REPLACE FUNCTION public.repair_package_instance_stages(p_package_instance_id bigint, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, p_package_instance_id, v_stage.sort_order,
      'not_started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    v_inserted_ids := v_inserted_ids || v_stage_instance_id;

    -- Phase SB: canonical text for staff_task_instances.
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'not_started'
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
     WHERE d.stage = v_stage.stage_id::integer
        OR EXISTS (
          SELECT 1 FROM public.document_stage_links dsl
          WHERE dsl.document_id = d.id AND dsl.stage_id = v_stage.stage_id::integer
        );
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

-- Step 3c: seed_stage_instances_from_template
CREATE OR REPLACE FUNCTION public.seed_stage_instances_from_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_stage RECORD;
  v_sii bigint;
BEGIN
  IF current_setting('app.skip_stage_seed', true) = 'on' THEN
    RETURN NEW;
  END IF;

  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = NEW.package_id
       AND NOT EXISTS (
         SELECT 1 FROM public.stage_instances si
          WHERE si.packageinstance_id = NEW.id
            AND si.stage_id = ps.stage_id::int)
     ORDER BY ps.sort_order
  LOOP
    INSERT INTO public.stage_instances (stage_id, packageinstance_id, stage_sortorder, status, is_recurring)
    VALUES (v_stage.stage_id::integer, NEW.id, v_stage.sort_order, 'not_started', v_stage.is_recurring)
    RETURNING id INTO v_sii;

    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_sii, 0, 'not_started'
      FROM public.staff_tasks st WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id, v_sii, 0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day') ELSE NULL END
      FROM public.client_tasks ct WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_sii, e.subject, e.content, false, ''
      FROM public.emails e WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_sii, NEW.tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer
        OR EXISTS (
          SELECT 1 FROM public.document_stage_links dsl
          WHERE dsl.document_id = d.id AND dsl.stage_id = v_stage.stage_id::integer
        );
  END LOOP;

  RETURN NEW;
END;
$function$;
