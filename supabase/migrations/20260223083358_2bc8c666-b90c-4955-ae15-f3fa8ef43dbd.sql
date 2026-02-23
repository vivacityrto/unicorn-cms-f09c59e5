
CREATE OR REPLACE FUNCTION public.rpc_match_clickup_to_rto_membership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matched int := 0;
  v_unmatched int := 0;
  v_no_entries int := 0;
  rec record;
  v_earliest date;
  v_pi_id bigint;
  v_pi_count int;
BEGIN
  FOR rec IN
    SELECT cta.id AS cta_id, cta.task_id, cta.tenant_id
    FROM clickup_tasks_api cta
    WHERE cta.tenant_id IS NOT NULL
      AND cta.packageinstance_id IS NULL
  LOOP
    -- Find earliest time entry date for this task
    SELECT MIN(cte.start_at::date) INTO v_earliest
    FROM clickup_time_entries cte
    WHERE cte.task_id = rec.task_id;

    IF v_earliest IS NULL THEN
      v_no_entries := v_no_entries + 1;
      CONTINUE;
    END IF;

    -- Count matching RTO membership package instances
    SELECT COUNT(*), MIN(pi.id)
    INTO v_pi_count, v_pi_id
    FROM package_instances pi
    JOIN packages p ON p.id = pi.package_id
    WHERE pi.tenant_id = rec.tenant_id
      AND p.name LIKE 'M-%R%'
      AND v_earliest >= pi.start_date
      AND v_earliest < (pi.start_date + interval '1 year');

    IF v_pi_count = 1 THEN
      UPDATE clickup_tasks_api
      SET packageinstance_id = v_pi_id
      WHERE id = rec.cta_id;
      v_matched := v_matched + 1;
    ELSE
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'unmatched', v_unmatched,
    'no_entries', v_no_entries
  );
END;
$$;
