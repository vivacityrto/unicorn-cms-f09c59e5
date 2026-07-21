CREATE OR REPLACE FUNCTION public.copy_stage_template_to_package(p_package_id bigint, p_stage_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE d.stage = p_stage_id
     OR EXISTS (
       SELECT 1 FROM public.document_stage_links dsl
       WHERE dsl.document_id = d.id AND dsl.stage_id = p_stage_id
     );

  UPDATE public.package_stages
  SET use_overrides = true, last_synced_at = now()
  WHERE package_id = p_package_id AND stage_id = p_stage_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.copy_stage_template_to_package(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_stage_template_to_package(bigint, bigint) TO authenticated;