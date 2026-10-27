-- Rock editor, stage 2: make the staff-gated Rock upsert say what it does.
--
-- 1. Remove the two silent behaviours. When an Individual Rock carried a team
--    (function_id), the function either created a "Client Rock - <client> - Qn YYYY"
--    Team Rock as a side effect (even when the caller had chosen a parent) or, with
--    no client, quietly picked the first Team Rock for that team as the parent. The
--    editor now makes both choices visible instead (the parent picker, and an
--    explicit "add under the Client Rock?" offer). Existing Rocks are not changed.
-- 2. A Rock that has a parent or children cannot change level.
-- 3. A new Company Rock joins the tenant's current V/TO (the app used to do this in
--    a second call), unless a vto_id is supplied.
--
-- Unchanged: the staff gate, parent validation on new or changed hierarchy values,
-- and created_by. The signature and return shape are identical, so CREATE OR REPLACE
-- is safe (no second overload). Rollback: rollback/20261027150000_*.down.sql.

CREATE OR REPLACE FUNCTION public.upsert_rock_with_parenting(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_rock_id uuid;
  v_parent_id uuid;
  v_scope text;
  v_function_id uuid;
  v_client_id integer;
  v_quarter_year integer;
  v_quarter_number integer;
  v_owner_id uuid;
  v_tenant_id bigint;
  v_rock_type text;
  v_existing_id uuid;
  v_result jsonb;
  v_parent_level text;
  v_parent_tenant_id bigint;
  v_parent_quarter_year integer;
  v_parent_quarter_number integer;
  v_parent_client_id integer;
  v_parent_archived_at timestamptz;
  v_current_parent_id uuid;
  v_current_rock_level text;
  v_current_quarter_year integer;
  v_current_quarter_number integer;
  v_current_client_id integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  v_rock_id := (p_payload->>'id')::uuid;
  v_scope := COALESCE(p_payload->>'rock_level', 'company');
  v_function_id := (p_payload->>'function_id')::uuid;
  v_client_id := (p_payload->>'client_tenant_id')::integer;
  v_quarter_year := (p_payload->>'quarter_year')::integer;
  v_quarter_number := (p_payload->>'quarter_number')::integer;
  v_owner_id := (p_payload->>'owner_id')::uuid;
  v_tenant_id := (p_payload->>'tenant_id')::bigint;
  v_rock_type := COALESCE(p_payload->>'rock_type', 'general');
  v_parent_id := (p_payload->>'parent_rock_id')::uuid;

  IF v_rock_id IS NOT NULL THEN
    SELECT parent_rock_id, rock_level, quarter_year, quarter_number, client_tenant_id
      INTO v_current_parent_id, v_current_rock_level, v_current_quarter_year,
           v_current_quarter_number, v_current_client_id
    FROM public.eos_rocks
    WHERE id = v_rock_id AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rock not found or tenant mismatch';
    END IF;
    v_quarter_year := COALESCE(v_quarter_year, v_current_quarter_year);
    v_quarter_number := COALESCE(v_quarter_number, v_current_quarter_number);

    -- A Rock that sits in the hierarchy keeps its level: changing it would orphan
    -- its parent or children. The caller creates a new Rock at the other level.
    IF v_current_rock_level IS DISTINCT FROM v_scope
       AND (v_current_parent_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.eos_rocks c WHERE c.parent_rock_id = v_rock_id)) THEN
      RAISE EXCEPTION 'A Rock that has a parent or children cannot change level';
    END IF;
  END IF;

  IF v_rock_id IS NULL
     OR v_current_parent_id IS DISTINCT FROM v_parent_id
     OR v_current_rock_level IS DISTINCT FROM v_scope
     OR v_current_quarter_year IS DISTINCT FROM v_quarter_year
     OR v_current_quarter_number IS DISTINCT FROM v_quarter_number
     OR v_current_client_id IS DISTINCT FROM v_client_id THEN
    IF v_scope = 'company' AND v_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Company Rocks cannot have a parent';
    END IF;
  END IF;

  IF v_parent_id IS NOT NULL
     AND (v_rock_id IS NULL
       OR v_current_parent_id IS DISTINCT FROM v_parent_id
       OR v_current_rock_level IS DISTINCT FROM v_scope
       OR v_current_quarter_year IS DISTINCT FROM v_quarter_year
       OR v_current_quarter_number IS DISTINCT FROM v_quarter_number
       OR v_current_client_id IS DISTINCT FROM v_client_id) THEN
    SELECT rock_level, tenant_id, quarter_year, quarter_number,
           client_tenant_id, archived_at
      INTO v_parent_level, v_parent_tenant_id, v_parent_quarter_year,
           v_parent_quarter_number, v_parent_client_id, v_parent_archived_at
    FROM public.eos_rocks
    WHERE id = v_parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent Rock not found';
    END IF;
    IF v_parent_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived Rocks cannot be parents';
    END IF;
    IF v_parent_tenant_id IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'Parent Rock tenant mismatch';
    END IF;
    IF v_parent_quarter_year IS DISTINCT FROM v_quarter_year
       OR v_parent_quarter_number IS DISTINCT FROM v_quarter_number THEN
      RAISE EXCEPTION 'Parent and child Rocks must be in the same quarter';
    END IF;
    IF v_scope = 'team' AND v_parent_level IS DISTINCT FROM 'company' THEN
      RAISE EXCEPTION 'Team Rocks must have a Company Rock parent';
    END IF;
    IF v_scope = 'individual'
       AND (v_parent_level IS NULL OR v_parent_level NOT IN ('company', 'team')) THEN
      RAISE EXCEPTION 'Individual Rocks must have a Company or Team Rock parent';
    END IF;
    IF v_scope NOT IN ('company', 'team', 'individual') THEN
      RAISE EXCEPTION 'Invalid Rock level';
    END IF;
    IF v_scope = 'individual'
       AND v_parent_client_id IS DISTINCT FROM v_client_id THEN
      RAISE EXCEPTION 'Individual Rock parent client mismatch';
    END IF;
  END IF;

  IF v_rock_id IS NOT NULL THEN
    UPDATE public.eos_rocks SET
      title = COALESCE(p_payload->>'title', title),
      description = p_payload->>'description',
      issue = p_payload->>'issue',
      outcome = p_payload->>'outcome',
      milestones = CASE WHEN p_payload ? 'milestones' THEN (p_payload->'milestones') ELSE milestones END,
      rock_level = v_scope,
      rock_type = v_rock_type,
      function_id = v_function_id,
      owner_id = v_owner_id,
      parent_rock_id = v_parent_id,
      client_tenant_id = v_client_id,
      quarter_year = COALESCE(v_quarter_year, quarter_year),
      quarter_number = COALESCE(v_quarter_number, quarter_number),
      due_date = COALESCE((p_payload->>'due_date')::date, due_date),
      status = COALESCE(p_payload->>'status', status),
      priority = COALESCE((p_payload->>'priority')::integer, priority),
      updated_at = now()
    WHERE id = v_rock_id AND tenant_id = v_tenant_id
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Rock not found or tenant mismatch';
    END IF;

    v_result := jsonb_build_object('id', v_rock_id, 'parent_rock_id', v_parent_id, 'action', 'updated');
  ELSE
    INSERT INTO public.eos_rocks (
      tenant_id, title, description, issue, outcome, milestones,
      rock_level, rock_type, function_id, owner_id, parent_rock_id,
      client_tenant_id,
      quarter_year, quarter_number, due_date,
      status, priority, created_by, vto_id
    ) VALUES (
      v_tenant_id,
      p_payload->>'title',
      p_payload->>'description',
      p_payload->>'issue',
      p_payload->>'outcome',
      CASE WHEN p_payload ? 'milestones' THEN (p_payload->'milestones') ELSE NULL END,
      v_scope, v_rock_type, v_function_id, v_owner_id, v_parent_id,
      v_client_id, v_quarter_year, v_quarter_number,
      (p_payload->>'due_date')::date,
      COALESCE(p_payload->>'status', 'on_track'),
      COALESCE((p_payload->>'priority')::integer, 1),
      auth.uid(),
      -- A new Company Rock joins the tenant's current V/TO unless one is named.
      CASE WHEN v_scope = 'company' THEN COALESCE(
        (p_payload->>'vto_id')::uuid,
        (SELECT v.id FROM public.eos_vto v WHERE v.tenant_id = v_tenant_id ORDER BY v.created_at DESC LIMIT 1)
      ) ELSE NULL END
    )
    RETURNING id INTO v_rock_id;

    v_result := jsonb_build_object('id', v_rock_id, 'parent_rock_id', v_parent_id, 'action', 'created');
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_rock_with_parenting(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_rock_with_parenting(jsonb) TO authenticated;
