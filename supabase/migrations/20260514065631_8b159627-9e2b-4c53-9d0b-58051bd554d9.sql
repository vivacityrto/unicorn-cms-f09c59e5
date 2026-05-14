-- =============================================================================
-- Rebind eos_rocks.client_id → client_tenant_id in 2 SECURITY DEFINER RPCs
-- =============================================================================
-- Context: eos_rocks.client_id (uuid) was renamed to client_tenant_id (integer,
-- FK tenants(id)) on 13 Feb 2026. Two RPCs still reference the gone column.
-- Bridge uuid → bigint via tenants.id_uuid → tenants.id. Unresolved uuids
-- degrade to NULL (untagged rock / zero counts) by design.
--
-- Scope: ONLY the eos_rocks code paths in these two functions. Legacy uuid
-- model retained on eos_issues, eos_todos, eos_item_clients, eos_meetings,
-- and users.client_id. search_path hardening deferred.
--
-- Rollback: copy-paste the PRE-CHANGE bodies below into a reverse migration.
--
-- ─── PRE-CHANGE: cascade_items (rock branch only) ────────────────────────────
--   INSERT INTO public.eos_rocks (
--     tenant_id, client_id, title, description, owner_id, status, quarter_year,
--     quarter_number, due_date, priority, progress, created_by
--   ) VALUES (
--     v_source.tenant_id, v_client_id, v_source.title, v_source.description,
--     v_source.owner_id, v_source.status, v_source.quarter_year,
--     v_source.quarter_number, v_source.due_date, v_source.priority,
--     v_source.progress, auth.uid()
--   ) RETURNING id INTO v_new_item_id;
--
-- ─── PRE-CHANGE: get_client_eos_overview (rocks JSON branch only) ────────────
--   'active',   (SELECT COUNT(*) FROM public.eos_rocks
--                WHERE client_id = p_client_id AND status != 'complete'),
--   'complete', (SELECT COUNT(*) FROM public.eos_rocks
--                WHERE client_id = p_client_id AND status = 'complete')
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cascade_items(
  p_target_client_ids uuid[], p_source_item_id uuid, p_item_type text
)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source RECORD;
  v_new_item_id UUID;
  v_created_ids UUID[] := '{}';
  v_client_id UUID;
  v_tenant_id BIGINT;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = auth.uid();

  IF NOT (is_super_admin() OR is_eos_admin(auth.uid(), v_tenant_id)) THEN
    RAISE EXCEPTION 'Only admins can cascade items';
  END IF;

  IF p_item_type = 'issue' THEN
    SELECT * INTO v_source FROM public.eos_issues WHERE id = p_source_item_id;
  ELSIF p_item_type = 'todo' THEN
    SELECT * INTO v_source FROM public.eos_todos WHERE id = p_source_item_id;
  ELSIF p_item_type = 'rock' THEN
    SELECT * INTO v_source FROM public.eos_rocks WHERE id = p_source_item_id;
  ELSE
    RAISE EXCEPTION 'Invalid item type';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source item not found';
  END IF;

  FOREACH v_client_id IN ARRAY p_target_client_ids
  LOOP
    IF p_item_type = 'issue' THEN
      INSERT INTO public.eos_issues (
        tenant_id, client_id, title, description, priority, status, meeting_id, created_by
      ) VALUES (
        v_source.tenant_id, v_client_id, v_source.title, v_source.description,
        v_source.priority, v_source.status, v_source.meeting_id, auth.uid()
      ) RETURNING id INTO v_new_item_id;

    ELSIF p_item_type = 'todo' THEN
      INSERT INTO public.eos_todos (
        tenant_id, client_id, title, description, owner_id, due_date, status, meeting_id, created_by
      ) VALUES (
        v_source.tenant_id, v_client_id, v_source.title, v_source.description,
        v_source.owner_id, v_source.due_date, v_source.status, v_source.meeting_id, auth.uid()
      ) RETURNING id INTO v_new_item_id;

    ELSIF p_item_type = 'rock' THEN
      -- CHANGED: client_id → client_tenant_id; v_client_id (uuid) bridged to bigint via tenants.id_uuid
      INSERT INTO public.eos_rocks (
        tenant_id, client_tenant_id, title, description, owner_id, status, quarter_year,
        quarter_number, due_date, priority, progress, created_by
      ) VALUES (
        v_source.tenant_id,
        (SELECT id FROM public.tenants WHERE id_uuid = v_client_id),
        v_source.title, v_source.description,
        v_source.owner_id, v_source.status, v_source.quarter_year,
        v_source.quarter_number, v_source.due_date, v_source.priority,
        v_source.progress, auth.uid()
      ) RETURNING id INTO v_new_item_id;
    END IF;

    v_created_ids := array_append(v_created_ids, v_new_item_id);

    INSERT INTO public.eos_item_clients (
      tenant_id, item_type, item_id, client_id
    ) VALUES (
      v_tenant_id, p_item_type, v_new_item_id, v_client_id
    );
  END LOOP;

  RETURN v_created_ids;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_client_eos_overview(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_user_client_id UUID;
  v_tenant_id BIGINT;
BEGIN
  SELECT client_id, tenant_id INTO v_user_client_id, v_tenant_id
  FROM public.users WHERE user_uuid = auth.uid();

  IF NOT (v_user_client_id = p_client_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'rocks', jsonb_build_object(
      -- CHANGED: client_id → client_tenant_id; p_client_id (uuid) bridged via tenants.id_uuid
      'active', (SELECT COUNT(*) FROM public.eos_rocks
                 WHERE client_tenant_id = (SELECT id FROM public.tenants WHERE id_uuid = p_client_id)
                   AND status != 'complete'),
      'complete', (SELECT COUNT(*) FROM public.eos_rocks
                   WHERE client_tenant_id = (SELECT id FROM public.tenants WHERE id_uuid = p_client_id)
                     AND status = 'complete')
    ),
    'issues', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM public.eos_issues WHERE client_id = p_client_id AND status = 'Open'),
      'solved', (SELECT COUNT(*) FROM public.eos_issues WHERE client_id = p_client_id AND status = 'Solved')
    ),
    'headlines', (SELECT COUNT(*) FROM public.eos_headlines h
      INNER JOIN public.eos_meetings m ON m.id = h.meeting_id
      WHERE m.client_id = p_client_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;