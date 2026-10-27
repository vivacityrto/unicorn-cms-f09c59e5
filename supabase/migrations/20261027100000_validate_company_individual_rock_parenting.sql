-- Extend the existing staff-gated Rock upsert to support Company -> Individual
-- Rocks and validate every supplied parent against the hierarchy, tenant and
-- quarter. Preserve the existing client Rock auto-parenting behavior.

CREATE OR REPLACE FUNCTION public.upsert_rock_with_parenting(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_rock_id uuid;
  v_parent_id uuid;
  v_team_rock_id uuid;
  v_scope text;
  v_function_id uuid;
  v_client_id integer;
  v_quarter_year integer;
  v_quarter_number integer;
  v_owner_id uuid;
  v_tenant_id bigint;
  v_rock_type text;
  v_title text;
  v_team_lead_id uuid;
  v_client_name text;
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
  END IF;

  IF v_scope = 'individual' AND v_function_id IS NOT NULL
     AND v_quarter_year IS NOT NULL AND v_quarter_number IS NOT NULL THEN

    IF v_client_id IS NOT NULL THEN
      SELECT id INTO v_team_rock_id
      FROM public.eos_rocks
      WHERE rock_level = 'team'
        AND rock_type = 'client'
        AND function_id = v_function_id
        AND quarter_year = v_quarter_year
        AND quarter_number = v_quarter_number
        AND client_tenant_id = v_client_id
        AND tenant_id = v_tenant_id
        AND archived_at IS NULL
      LIMIT 1;

      IF v_team_rock_id IS NULL THEN
        SELECT sa.user_id INTO v_team_lead_id
        FROM public.accountability_seat_assignments sa
        JOIN public.accountability_seats s ON s.id = sa.seat_id
        WHERE s.function_id = v_function_id
          AND sa.assignment_type = 'Primary'
          AND sa.tenant_id = v_tenant_id
          AND (sa.end_date IS NULL OR sa.end_date > now())
        ORDER BY sa.start_date ASC
        LIMIT 1;

        IF v_team_lead_id IS NULL THEN
          v_team_lead_id := v_owner_id;
        END IF;

        SELECT name INTO v_client_name
        FROM public.tenants WHERE id = v_client_id;

        v_client_name := COALESCE(v_client_name, 'Client ' || v_client_id);

        INSERT INTO public.eos_rocks (
          tenant_id, title, description, rock_level, rock_type,
          function_id, owner_id, client_tenant_id,
          quarter_year, quarter_number, due_date,
          status, priority
        ) VALUES (
          v_tenant_id,
          'Client Rock - ' || v_client_name || ' - Q' || v_quarter_number || ' ' || v_quarter_year,
          'Coordinate team delivery for ' || v_client_name || ' this quarter.',
          'team', 'client',
          v_function_id, v_team_lead_id, v_client_id,
          v_quarter_year, v_quarter_number,
          make_date(v_quarter_year, v_quarter_number * 3,
            CASE WHEN v_quarter_number IN (1,4) THEN 31 ELSE 30 END),
          'on_track', 3
        )
        RETURNING id INTO v_team_rock_id;
      END IF;

      IF v_parent_id IS NULL THEN
        v_parent_id := v_team_rock_id;
      END IF;
    ELSE
      IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id
        FROM public.eos_rocks
        WHERE rock_level = 'team'
          AND function_id = v_function_id
          AND quarter_year = v_quarter_year
          AND quarter_number = v_quarter_number
          AND client_tenant_id IS NULL
          AND tenant_id = v_tenant_id
          AND archived_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;
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
      status, priority, created_by
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
      auth.uid()
    )
    RETURNING id INTO v_rock_id;

    v_result := jsonb_build_object('id', v_rock_id, 'parent_rock_id', v_parent_id, 'action', 'created');
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_rock_with_parenting(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_rock_with_parenting(jsonb) TO authenticated;
