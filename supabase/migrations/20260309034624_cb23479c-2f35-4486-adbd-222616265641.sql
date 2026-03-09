
-- ============================================================
-- 1. Create dd_rock_status lookup table (already created by partial run, use IF NOT EXISTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dd_rock_status (
  code integer PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.dd_rock_status (code, value, label, color, sort_order) VALUES
  (0, 'not_started', 'Not Started', 'text-gray-600', 0),
  (1, 'on_track', 'On Track', 'text-green-600', 1),
  (2, 'at_risk', 'At Risk', 'text-amber-600', 2),
  (3, 'off_track', 'Off Track', 'text-red-600', 3),
  (4, 'complete', 'Complete', 'text-blue-600', 4)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.dd_rock_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dd_rock_status' AND policyname = 'Authenticated users can read dd_rock_status'
  ) THEN
    CREATE POLICY "Authenticated users can read dd_rock_status"
      ON public.dd_rock_status FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- 2. Drop dependent views (in dependency order)
-- ============================================================
DROP VIEW IF EXISTS public.v_executive_momentum_7d CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_weekly_wins CASCADE;
DROP VIEW IF EXISTS public.v_client_eos_summary CASCADE;
DROP VIEW IF EXISTS public.seat_linked_data CASCADE;

-- ============================================================
-- 3. Drop trigger that depends on status column
-- ============================================================
DROP TRIGGER IF EXISTS trg_cascade_rock_status ON eos_rocks;

-- ============================================================
-- 4. Migrate eos_rocks.status from enum to text
-- ============================================================
ALTER TABLE public.eos_rocks ADD COLUMN IF NOT EXISTS status_text text;

UPDATE public.eos_rocks SET status_text = CASE
  WHEN status::text = 'Not_Started' THEN 'not_started'
  WHEN status::text = 'On_Track' THEN 'on_track'
  WHEN status::text = 'At_Risk' THEN 'at_risk'
  WHEN status::text = 'Off_Track' THEN 'off_track'
  WHEN status::text = 'Complete' THEN 'complete'
  ELSE 'on_track'
END;

ALTER TABLE public.eos_rocks DROP COLUMN status;
ALTER TABLE public.eos_rocks RENAME COLUMN status_text TO status;
ALTER TABLE public.eos_rocks ALTER COLUMN status SET DEFAULT 'not_started';

-- ============================================================
-- 5. Recreate trigger
-- ============================================================
CREATE OR REPLACE FUNCTION cascade_rock_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_rock_id IS NOT NULL AND 
     (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
    UPDATE eos_rocks 
    SET updated_at = NOW()
    WHERE id = NEW.parent_rock_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_rock_status
  AFTER INSERT OR UPDATE OF status ON eos_rocks
  FOR EACH ROW
  EXECUTE FUNCTION cascade_rock_status_change();

-- ============================================================
-- 6. Recreate dependent views with lowercase status values
-- ============================================================

-- seat_linked_data
CREATE OR REPLACE VIEW public.seat_linked_data AS
SELECT 
  s.id AS seat_id, s.tenant_id, s.seat_name, s.eos_role_type,
  sa.user_id AS primary_owner_id,
  (SELECT COUNT(*) FROM public.eos_rocks r 
   WHERE r.owner_id = sa.user_id AND r.tenant_id = s.tenant_id AND r.status NOT IN ('complete')) AS active_rocks_count,
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'attended' AND m.status = 'closed') AS meetings_attended_count,
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'no_show' AND m.status = 'closed') AS meetings_missed_count
FROM public.accountability_seats s
LEFT JOIN public.accountability_seat_assignments sa 
  ON sa.seat_id = s.id AND sa.assignment_type = 'Primary' AND sa.end_date IS NULL;

ALTER VIEW public.seat_linked_data SET (security_invoker = true);
GRANT SELECT ON public.seat_linked_data TO authenticated;

-- v_client_eos_summary
CREATE OR REPLACE VIEW public.v_client_eos_summary
WITH (security_invoker = true)
AS
SELECT 
    t.id as tenant_id,
    t.name as client_name,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id) as total_rocks,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'on_track') as rocks_on_track,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'off_track') as rocks_off_track,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'complete') as rocks_completed,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) as total_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Open' AND ei.deleted_at IS NULL) as open_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Solved' AND ei.deleted_at IS NULL) as solved_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type::text = 'Risk' AND ei.deleted_at IS NULL) as risk_count,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type::text = 'Opportunity' AND ei.deleted_at IS NULL) as opportunity_count,
    (SELECT COUNT(*) FROM public.eos_todos et WHERE et.tenant_id = t.id) as total_todos,
    (SELECT COUNT(*) FROM public.eos_todos et WHERE et.tenant_id = t.id AND et.status::text = 'Done') as completed_todos,
    (SELECT COUNT(*) FROM public.eos_meetings em WHERE em.tenant_id = t.id) as total_meetings,
    (SELECT COUNT(*) FROM public.eos_meetings em WHERE em.tenant_id = t.id AND em.is_complete = true) as completed_meetings
FROM public.tenants t;

-- v_dashboard_weekly_wins
CREATE OR REPLACE VIEW public.v_dashboard_weekly_wins
WITH (security_invoker = true)
AS
WITH week_bounds AS (
  SELECT
    date_trunc('week', now() AT TIME ZONE 'Australia/Sydney')::timestamptz AS week_start,
    (date_trunc('week', now() AT TIME ZONE 'Australia/Sydney') + interval '7 days')::timestamptz AS week_end
)
SELECT
  u.user_uuid,
  wb.week_start::date AS week_start_date,
  COALESCE((
    SELECT COUNT(*) FROM eos_rocks r
    WHERE r.owner_id = u.user_uuid
      AND r.status = 'complete'
      AND r.completed_date >= wb.week_start::date
      AND r.completed_date < wb.week_end::date
  ), 0)::int AS rocks_closed,
  COALESCE((
    SELECT COUNT(*) FROM client_package_stage_state cpss
    JOIN package_instances pi ON pi.package_id = cpss.package_id AND pi.tenant_id = cpss.tenant_id
    WHERE pi.manager_id = u.user_uuid
      AND cpss.status = 'complete'
      AND cpss.completed_at >= wb.week_start
      AND cpss.completed_at < wb.week_end
  ), 0)::int AS phases_completed,
  COALESCE((
    SELECT COUNT(*) FROM document_instances di
    WHERE di.isgenerated = true
      AND di.created_at >= wb.week_start
      AND di.created_at < wb.week_end
      AND di.tenant_id IN (
        SELECT pi2.tenant_id FROM package_instances pi2
        WHERE pi2.manager_id = u.user_uuid AND pi2.is_complete = false
      )
  ), 0)::int AS documents_generated,
  COALESCE((
    SELECT COUNT(DISTINCT cpss2.tenant_id) FROM client_package_stage_state cpss2
    JOIN package_instances pi3 ON pi3.package_id = cpss2.package_id AND pi3.tenant_id = cpss2.tenant_id
    WHERE pi3.manager_id = u.user_uuid
      AND cpss2.updated_at >= wb.week_start
      AND cpss2.updated_at < wb.week_end
      AND cpss2.status IN ('complete', 'in_progress')
  ), 0)::int AS clients_moved_forward,
  COALESCE((
    SELECT ROUND(SUM(te.duration_minutes) / 60.0, 1) FROM time_entries te
    WHERE te.user_id = u.user_uuid
      AND te.created_at >= wb.week_start
      AND te.created_at < wb.week_end
  ), 0)::numeric AS hours_logged,
  COALESCE((
    SELECT COUNT(*) FROM celebration_events ce
    WHERE ce.actor_user_uuid = u.user_uuid
      AND ce.created_at >= wb.week_start
      AND ce.created_at < wb.week_end
  ), 0)::int AS milestones_count
FROM users u
CROSS JOIN week_bounds wb
WHERE u.is_vivacity_internal = true;

-- v_executive_momentum_7d
CREATE OR REPLACE VIEW public.v_executive_momentum_7d
WITH (security_invoker = true) AS
WITH current_week AS (
  SELECT
    COALESCE(SUM(phases_completed), 0) AS phases_completed,
    COALESCE(SUM(documents_generated), 0) AS documents_generated,
    COALESCE(SUM(clients_moved_forward), 0) AS clients_moved_forward,
    COALESCE(SUM(rocks_closed), 0) AS rocks_closed,
    COALESCE(SUM(hours_logged), 0) AS hours_logged
  FROM v_dashboard_weekly_wins
  WHERE week_start_date >= (CURRENT_DATE - interval '7 days')::date
),
previous_week AS (
  SELECT
    COALESCE(SUM(phases_completed), 0) AS phases_completed,
    COALESCE(SUM(documents_generated), 0) AS documents_generated,
    COALESCE(SUM(clients_moved_forward), 0) AS clients_moved_forward,
    COALESCE(SUM(rocks_closed), 0) AS rocks_closed,
    COALESCE(SUM(hours_logged), 0) AS hours_logged
  FROM v_dashboard_weekly_wins
  WHERE week_start_date >= (CURRENT_DATE - interval '14 days')::date
    AND week_start_date < (CURRENT_DATE - interval '7 days')::date
)
SELECT
  c.phases_completed AS phases_completed_7d,
  p.phases_completed AS phases_completed_prev_7d,
  c.documents_generated AS documents_generated_7d,
  p.documents_generated AS documents_generated_prev_7d,
  c.clients_moved_forward AS clients_moved_forward_7d,
  p.clients_moved_forward AS clients_moved_forward_prev_7d,
  c.rocks_closed AS rocks_closed_7d,
  p.rocks_closed AS rocks_closed_prev_7d,
  c.hours_logged AS hours_logged_7d,
  p.hours_logged AS hours_logged_prev_7d
FROM current_week c, previous_week p;

-- ============================================================
-- 7. Update remaining functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.cascade_seat_owner_to_rocks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assignment_type = 'Primary' THEN
    UPDATE public.eos_rocks
    SET seat_owner_user_id = NEW.user_id,
        owner_id = NEW.user_id,
        updated_at = now()
    WHERE seat_id = NEW.seat_id
      AND (status IS NULL OR status NOT IN ('complete'));
      
    INSERT INTO public.audit_eos_events (
      tenant_id, action, entity, entity_id, user_id, details
    )
    SELECT 
      r.tenant_id,
      'rock_owner_changed_via_seat',
      'eos_rocks',
      r.id::text,
      NEW.user_id,
      jsonb_build_object(
        'seat_id', NEW.seat_id,
        'previous_owner', r.seat_owner_user_id,
        'new_owner', NEW.user_id,
        'reason', 'seat_assignment_change'
      )
    FROM public.eos_rocks r
    WHERE r.seat_id = NEW.seat_id
      AND (r.status IS NULL OR r.status NOT IN ('complete'));
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_rock_with_parenting(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  v_rock_id := (p_payload->>'id')::uuid;
  v_scope := COALESCE(p_payload->>'rock_level', 'company');
  v_function_id := (p_payload->>'function_id')::uuid;
  v_client_id := (p_payload->>'client_id')::integer;
  v_quarter_year := (p_payload->>'quarter_year')::integer;
  v_quarter_number := (p_payload->>'quarter_number')::integer;
  v_owner_id := (p_payload->>'owner_id')::uuid;
  v_tenant_id := (p_payload->>'tenant_id')::bigint;
  v_rock_type := COALESCE(p_payload->>'rock_type', 'general');
  v_parent_id := (p_payload->>'parent_rock_id')::uuid;

  IF v_scope = 'individual' AND v_function_id IS NOT NULL 
     AND v_quarter_year IS NOT NULL AND v_quarter_number IS NOT NULL THEN

    IF v_client_id IS NOT NULL THEN
      SELECT id INTO v_team_rock_id
      FROM eos_rocks
      WHERE rock_level = 'team'
        AND rock_type = 'client'
        AND function_id = v_function_id
        AND quarter_year = v_quarter_year
        AND quarter_number = v_quarter_number
        AND client_id = v_client_id
        AND tenant_id = v_tenant_id
        AND archived_at IS NULL
      LIMIT 1;

      IF v_team_rock_id IS NULL THEN
        SELECT sa.user_id INTO v_team_lead_id
        FROM accountability_seat_assignments sa
        JOIN accountability_seats s ON s.id = sa.seat_id
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
        FROM tenants WHERE id = v_client_id;

        v_client_name := COALESCE(v_client_name, 'Client ' || v_client_id);

        INSERT INTO eos_rocks (
          tenant_id, title, description, rock_level, rock_type,
          function_id, owner_id, client_id,
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
        FROM eos_rocks
        WHERE rock_level = 'team'
          AND function_id = v_function_id
          AND quarter_year = v_quarter_year
          AND quarter_number = v_quarter_number
          AND client_id IS NULL
          AND tenant_id = v_tenant_id
          AND archived_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_rock_id IS NOT NULL THEN
    UPDATE eos_rocks SET
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
      client_id = v_client_id,
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
    INSERT INTO eos_rocks (
      tenant_id, title, description, issue, outcome, milestones,
      rock_level, rock_type, function_id, owner_id, parent_rock_id,
      client_id, quarter_year, quarter_number, due_date,
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
$$;

-- ============================================================
-- 8. Drop the old enum type
-- ============================================================
DROP TYPE IF EXISTS public.eos_rock_status;
