CREATE OR REPLACE FUNCTION public.rpc_create_action_item(
  p_tenant_id integer,
  p_client_id text,
  p_title text,
  p_description text DEFAULT NULL::text,
  p_owner_user_id uuid DEFAULT NULL::uuid,
  p_due_date date DEFAULT NULL::date,
  p_priority text DEFAULT 'medium'::text,
  p_source text DEFAULT 'manual'::text,
  p_source_note_id uuid DEFAULT NULL::uuid,
  p_related_entity_type text DEFAULT NULL::text,
  p_related_entity_id text DEFAULT NULL::text,
  p_recurrence_rule text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_action_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  -- Validate priority against dd_priority lookup table
  IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = p_priority AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
  END IF;

  -- Validate source
  IF p_source NOT IN ('manual', 'note', 'stage_rule', 'system', 'task_assignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  INSERT INTO public.client_action_items (
    tenant_id, client_id, created_by, title, description, owner_user_id,
    due_date, priority, source, source_note_id, related_entity_type,
    related_entity_id, recurrence_rule
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_title, p_description, p_owner_user_id,
    p_due_date, p_priority, p_source, p_source_note_id, p_related_entity_type,
    p_related_entity_id, p_recurrence_rule
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
$function$;