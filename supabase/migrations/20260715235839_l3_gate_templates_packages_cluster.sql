
-- L3 (16 Jul 2026 addendum): Templates/packages cluster. All five are
-- staff/ops template-authoring tools (package-template propagation, EOS
-- agenda template versioning, Excel merge-field binding management) with
-- platform-wide blast radius (package templates apply across every tenant
-- using that package) and zero caller-identity check. Gate:
-- is_vivacity_team_safe(auth.uid()).

create or replace function public.copy_stage_template_to_package(p_package_id bigint, p_stage_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  INSERT INTO public.package_staff_tasks (
    package_id, stage_id, name, description, order_number,
    owner_role, estimated_hours, is_mandatory,
    source_stage_task_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, name, description, sort_order,
    owner_role, estimated_hours, is_mandatory,
    id, false, false
  FROM public.stage_team_tasks
  WHERE stage_id = p_stage_id;

  INSERT INTO public.package_client_tasks (
    package_id, stage_id, name, description, order_number,
    instructions, required_documents, due_date_offset,
    source_stage_task_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, name, description, sort_order,
    instructions, required_documents, due_date_offset,
    id, false, false
  FROM public.stage_client_tasks
  WHERE stage_id = p_stage_id;

  INSERT INTO public.package_stage_emails (
    package_id, stage_id, email_template_id, trigger_type,
    recipient_type, sort_order, is_active,
    source_stage_email_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, email_template_id, trigger_type,
    recipient_type, sort_order, is_active,
    id, false, false
  FROM public.stage_emails
  WHERE stage_id = p_stage_id;

  INSERT INTO public.package_stage_documents (
    package_id, stage_id, document_id, visibility, delivery_type, sort_order,
    source_stage_document_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, d.id, 'both', 'manual', 0,
    d.id, false, false
  FROM public.documents d
  WHERE d.stage = p_stage_id;

  UPDATE public.package_stages
  SET use_overrides = true, last_synced_at = now()
  WHERE package_id = p_package_id AND stage_id = p_stage_id;
END;
$function$;

create or replace function public.sync_stage_template_to_packages(p_stage_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_package record;
  v_updated_count int := 0;
  v_skipped_count int := 0;
  v_result jsonb := '{"updated": [], "skipped": []}';
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  FOR v_package IN
    SELECT ps.package_id, p.name as package_name
    FROM public.package_stages ps
    JOIN public.packages p ON p.id = ps.package_id
    WHERE ps.stage_id = p_stage_id AND ps.use_overrides = true
  LOOP
    UPDATE public.package_staff_tasks pt
    SET
      name = st.name,
      description = st.description,
      order_number = st.sort_order,
      owner_role = st.owner_role,
      estimated_hours = st.estimated_hours,
      is_mandatory = st.is_mandatory,
      updated_at = now()
    FROM public.stage_team_tasks st
    WHERE pt.source_stage_task_id = st.id
      AND pt.package_id = v_package.package_id
      AND pt.stage_id = p_stage_id
      AND pt.is_override = false
      AND pt.is_deleted = false;

    UPDATE public.package_client_tasks pt
    SET
      name = st.name,
      description = st.description,
      order_number = st.sort_order,
      instructions = st.instructions,
      required_documents = st.required_documents,
      due_date_offset = st.due_date_offset,
      updated_at = now()
    FROM public.stage_client_tasks st
    WHERE pt.source_stage_task_id = st.id
      AND pt.package_id = v_package.package_id
      AND pt.stage_id = p_stage_id
      AND pt.is_override = false
      AND pt.is_deleted = false;

    UPDATE public.package_stage_emails pe
    SET
      email_template_id = se.email_template_id,
      trigger_type = se.trigger_type,
      recipient_type = se.recipient_type,
      sort_order = se.sort_order,
      is_active = se.is_active
    FROM public.stage_emails se
    WHERE pe.source_stage_email_id = se.id
      AND pe.package_id = v_package.package_id
      AND pe.stage_id = p_stage_id
      AND pe.is_override = false
      AND pe.is_deleted = false;

    UPDATE public.package_stage_documents pd
    SET
      document_id = sd.document_id,
      visibility = sd.visibility,
      delivery_type = sd.delivery_type,
      sort_order = sd.sort_order
    FROM public.stage_documents sd
    WHERE pd.source_stage_document_id = sd.id
      AND pd.package_id = v_package.package_id
      AND pd.stage_id = p_stage_id
      AND pd.is_override = false
      AND pd.is_deleted = false;

    INSERT INTO public.package_staff_tasks (
      package_id, stage_id, name, description, order_number,
      owner_role, estimated_hours, is_mandatory,
      source_stage_task_id, is_override, is_deleted
    )
    SELECT
      v_package.package_id, p_stage_id, st.name, st.description, st.sort_order,
      st.owner_role, st.estimated_hours, st.is_mandatory,
      st.id, false, false
    FROM public.stage_team_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_staff_tasks pt
        WHERE pt.package_id = v_package.package_id
          AND pt.stage_id = p_stage_id
          AND pt.source_stage_task_id = st.id
      );

    INSERT INTO public.package_client_tasks (
      package_id, stage_id, name, description, order_number,
      instructions, required_documents, due_date_offset,
      source_stage_task_id, is_override, is_deleted
    )
    SELECT
      v_package.package_id, p_stage_id, st.name, st.description, st.sort_order,
      st.instructions, st.required_documents, st.due_date_offset,
      st.id, false, false
    FROM public.stage_client_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_client_tasks pt
        WHERE pt.package_id = v_package.package_id
          AND pt.stage_id = p_stage_id
          AND pt.source_stage_task_id = st.id
      );

    INSERT INTO public.package_stage_emails (
      package_id, stage_id, email_template_id, trigger_type,
      recipient_type, sort_order, is_active,
      source_stage_email_id, is_override, is_deleted
    )
    SELECT
      v_package.package_id, p_stage_id, se.email_template_id, se.trigger_type,
      se.recipient_type, se.sort_order, se.is_active,
      se.id, false, false
    FROM public.stage_emails se
    WHERE se.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_stage_emails pe
        WHERE pe.package_id = v_package.package_id
          AND pe.stage_id = p_stage_id
          AND pe.source_stage_email_id = se.id
      );

    INSERT INTO public.package_stage_documents (
      package_id, stage_id, document_id, visibility, delivery_type, sort_order,
      source_stage_document_id, is_override, is_deleted
    )
    SELECT
      v_package.package_id, p_stage_id, sd.document_id, sd.visibility, sd.delivery_type, sd.sort_order,
      sd.id, false, false
    FROM public.stage_documents sd
    WHERE sd.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_stage_documents pd
        WHERE pd.package_id = v_package.package_id
          AND pd.stage_id = p_stage_id
          AND pd.source_stage_document_id = sd.id
      );

    UPDATE public.package_stages
    SET last_synced_at = now()
    WHERE package_id = v_package.package_id AND stage_id = p_stage_id;

    v_updated_count := v_updated_count + 1;
    v_result := jsonb_set(v_result, '{updated}', (v_result->'updated') || to_jsonb(v_package.package_name));
  END LOOP;

  v_result := jsonb_set(v_result, '{updated_count}', to_jsonb(v_updated_count));
  v_result := jsonb_set(v_result, '{skipped_count}', to_jsonb(v_skipped_count));

  RETURN v_result;
END;
$function$;

create or replace function public.init_template_versions()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_template RECORD;
  v_version_id UUID;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  FOR v_template IN
    SELECT * FROM public.eos_agenda_templates
    WHERE current_version_id IS NULL
  LOOP
    INSERT INTO public.eos_agenda_template_versions (
      template_id, version_number, segments_snapshot, change_summary,
      is_published, created_by, created_at
    ) VALUES (
      v_template.id, 1, v_template.segments, 'Initial version',
      TRUE, v_template.created_by, v_template.created_at
    ) RETURNING id INTO v_version_id;

    UPDATE public.eos_agenda_templates
    SET current_version_id = v_version_id
    WHERE id = v_template.id;
  END LOOP;
END;
$function$;

create or replace function public.upsert_excel_template_bindings(
  p_document_id bigint,
  p_detected_tokens jsonb,
  p_detected_dropdowns jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_binding_id uuid;
  v_existing_token_bindings jsonb;
  v_existing_dropdown_bindings jsonb;
  v_merged_token_bindings jsonb := '{}'::jsonb;
  v_merged_dropdown_bindings jsonb := '{}'::jsonb;
  v_token record;
  v_dropdown record;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT id, token_bindings, dropdown_bindings
  INTO v_binding_id, v_existing_token_bindings, v_existing_dropdown_bindings
  FROM public.excel_template_bindings
  WHERE document_id = p_document_id;

  IF v_existing_token_bindings IS NOT NULL THEN
    FOR v_token IN SELECT jsonb_array_elements(p_detected_tokens) AS token
    LOOP
      IF v_existing_token_bindings ? (v_token.token->>'token') THEN
        v_merged_token_bindings := v_merged_token_bindings ||
          jsonb_build_object(v_token.token->>'token', v_existing_token_bindings->(v_token.token->>'token'));
      END IF;
    END LOOP;
  END IF;

  IF v_existing_dropdown_bindings IS NOT NULL THEN
    FOR v_dropdown IN SELECT jsonb_array_elements(p_detected_dropdowns) AS dropdown
    LOOP
      IF v_existing_dropdown_bindings ? (v_dropdown.dropdown->>'dropdown_id') THEN
        v_merged_dropdown_bindings := v_merged_dropdown_bindings ||
          jsonb_build_object(v_dropdown.dropdown->>'dropdown_id', v_existing_dropdown_bindings->(v_dropdown.dropdown->>'dropdown_id'));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.excel_template_bindings (
    document_id, detected_tokens, detected_dropdowns, token_bindings,
    dropdown_bindings, binding_version, status, updated_at
  )
  VALUES (
    p_document_id, p_detected_tokens, p_detected_dropdowns,
    v_merged_token_bindings, v_merged_dropdown_bindings,
    COALESCE((SELECT binding_version + 1 FROM public.excel_template_bindings WHERE document_id = p_document_id), 1),
    'draft', now()
  )
  ON CONFLICT (document_id)
  DO UPDATE SET
    detected_tokens = EXCLUDED.detected_tokens,
    detected_dropdowns = EXCLUDED.detected_dropdowns,
    token_bindings = v_merged_token_bindings,
    dropdown_bindings = v_merged_dropdown_bindings,
    binding_version = public.excel_template_bindings.binding_version + 1,
    status = 'draft',
    updated_at = now()
  RETURNING id INTO v_binding_id;

  RETURN v_binding_id;
END;
$function$;

create or replace function public.validate_excel_bindings(p_document_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_bindings record;
  v_errors jsonb := '[]'::jsonb;
  v_token record;
  v_dropdown record;
  v_list_count integer;
  v_status text := 'ready';
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'errors', jsonb_build_array(jsonb_build_object('type','forbidden','message','Forbidden: staff only')), 'status', 'error');
  END IF;

  SELECT * INTO v_bindings
  FROM public.excel_template_bindings
  WHERE document_id = p_document_id;

  IF v_bindings IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'type', 'no_bindings',
        'message', 'No bindings record found for this document'
      )),
      'status', 'error'
    );
  END IF;

  FOR v_token IN SELECT jsonb_array_elements(v_bindings.detected_tokens) AS token
  LOOP
    IF NOT (v_bindings.token_bindings ? (v_token.token->>'token')) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'type', 'unbound_token',
        'token', v_token.token->>'token',
        'location', v_token.token->>'sheet' || '!' || v_token.token->>'cell',
        'message', 'Token is not bound to a data source'
      ));
      v_status := 'error';
    END IF;
  END LOOP;

  FOR v_dropdown IN SELECT jsonb_array_elements(v_bindings.detected_dropdowns) AS dropdown
  LOOP
    IF NOT (v_bindings.dropdown_bindings ? (v_dropdown.dropdown->>'dropdown_id')) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'type', 'unbound_dropdown',
        'dropdown_id', v_dropdown.dropdown->>'dropdown_id',
        'location', v_dropdown.dropdown->>'sheet' || '!' || v_dropdown.dropdown->>'cell',
        'message', 'Dropdown is not bound to a lookup list'
      ));
      v_status := 'error';
    ELSE
      SELECT COUNT(*) INTO v_list_count
      FROM public.lookup_list_items li
      JOIN public.lookup_lists ll ON ll.id = li.list_id
      WHERE ll.id = (v_bindings.dropdown_bindings->(v_dropdown.dropdown->>'dropdown_id')->>'list_id')::uuid
        AND li.is_active = true;

      IF v_list_count = 0 THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'type', 'empty_list',
          'dropdown_id', v_dropdown.dropdown->>'dropdown_id',
          'location', v_dropdown.dropdown->>'sheet' || '!' || v_dropdown.dropdown->>'cell',
          'message', 'Bound lookup list has no active items'
        ));
        v_status := 'error';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.excel_template_bindings
  SET
    status = v_status,
    validation_errors = v_errors,
    last_validated_at = now(),
    updated_at = now()
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object(
    'success', v_status = 'ready',
    'errors', v_errors,
    'status', v_status
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
