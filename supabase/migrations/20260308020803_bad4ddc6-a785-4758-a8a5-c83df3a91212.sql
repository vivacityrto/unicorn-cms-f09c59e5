-- Skip auto-allocation for carry-over time entries (negative minutes)
CREATE OR REPLACE FUNCTION fn_auto_allocate_time_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip allocation for carry-over entries (they have negative duration)
  IF NEW.work_type = 'carry_over' THEN
    RETURN NEW;
  END IF;

  PERFORM allocate_time_entry(NEW.id, NEW.user_id, 'auto');
  RETURN NEW;
END;
$$;