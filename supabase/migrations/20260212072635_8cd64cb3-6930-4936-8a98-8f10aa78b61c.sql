
-- Drop existing function with old parameter name
DROP FUNCTION IF EXISTS public.compute_consultant_weekly_capacity(uuid);

-- Recreate with correct parameter name
CREATE OR REPLACE FUNCTION public.compute_consultant_weekly_capacity(p_user_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_days int;
  v_start_time time;
  v_end_time time;
  v_daily_hours numeric;
BEGIN
  SELECT working_days, working_hours, archived, disabled, allocation_paused
  INTO v_user
  FROM users
  WHERE user_uuid = p_user_uuid;

  IF v_user IS NULL THEN RETURN 0; END IF;
  IF v_user.archived OR v_user.allocation_paused THEN RETURN 0; END IF;

  v_days := count_selected_work_days(v_user.working_days);
  IF v_days = 0 THEN RETURN 0; END IF;

  IF v_user.working_hours IS NULL THEN RETURN 0; END IF;

  BEGIN
    v_start_time := (v_user.working_hours->>'start')::time;
    v_end_time   := (v_user.working_hours->>'end')::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;

  IF v_end_time <= v_start_time THEN RETURN 0; END IF;

  v_daily_hours := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) / 3600.0;

  RETURN ROUND(v_days * v_daily_hours * 0.80 * 0.90, 2);
END;
$$;

-- Create the tenant-isolated view
CREATE OR REPLACE VIEW public.vw_consultant_capacity AS
SELECT
  tm.tenant_id,
  u.user_uuid,
  public.compute_consultant_weekly_capacity(u.user_uuid) AS weekly_assignable_hours
FROM users u
JOIN tenant_members tm ON tm.user_id = u.user_uuid AND tm.status = 'active'
WHERE u.is_vivacity_internal = true
  AND u.disabled = false;
