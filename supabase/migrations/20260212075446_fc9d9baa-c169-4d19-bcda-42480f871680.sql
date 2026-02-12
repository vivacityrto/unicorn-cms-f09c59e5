CREATE OR REPLACE FUNCTION public.rpc_get_consultant_capacity_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_consultant RECORD;
  v_assignable numeric;
  v_load numeric;
  v_remaining numeric;
  v_active_clients bigint;
BEGIN
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_consultant IN
    SELECT user_uuid, first_name, last_name, job_title
    FROM users
    WHERE is_vivacity_internal = true
      AND disabled = false
      AND archived = false
      AND job_title = 'Client Success Champion'
    ORDER BY first_name
  LOOP
    v_assignable := compute_consultant_weekly_capacity(v_consultant.user_uuid);
    v_load := compute_consultant_current_load(v_consultant.user_uuid);
    v_remaining := v_assignable - v_load;

    SELECT count(*) INTO v_active_clients
    FROM tenants
    WHERE assigned_consultant_user_id = v_consultant.user_uuid
      AND status = 'active';

    v_result := v_result || jsonb_build_object(
      'user_uuid', v_consultant.user_uuid,
      'first_name', v_consultant.first_name,
      'last_name', v_consultant.last_name,
      'job_title', v_consultant.job_title,
      'weekly_assignable_hours', round(v_assignable, 2),
      'current_load', round(v_load, 2),
      'remaining_capacity', round(v_remaining, 2),
      'active_clients', v_active_clients,
      'overload', v_load > v_assignable
    );
  END LOOP;

  RETURN v_result;
END;
$function$;