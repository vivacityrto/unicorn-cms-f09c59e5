
-- Create the missing helper function
CREATE OR REPLACE FUNCTION public.count_selected_work_days(p_schedule jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_key text;
  v_elem jsonb;
BEGIN
  IF p_schedule IS NULL THEN RETURN 0; END IF;

  -- Array format: ["mon","tue",...] or ["Monday",...]
  IF jsonb_typeof(p_schedule) = 'array' THEN
    RETURN jsonb_array_length(p_schedule);
  END IF;

  -- Object format: {"mon": true, "tue": false, ...}
  IF jsonb_typeof(p_schedule) = 'object' THEN
    FOR v_key, v_elem IN SELECT * FROM jsonb_each(p_schedule)
    LOOP
      IF v_elem = 'true'::jsonb THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
    RETURN v_count;
  END IF;

  RETURN 0;
END;
$$;
