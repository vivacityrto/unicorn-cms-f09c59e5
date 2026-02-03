-- Fix the cascade_seat_owner_to_rocks trigger function to use correct enum values
-- The eos_rock_status enum uses: Not_Started, On_Track, At_Risk, Off_Track, Complete
-- The previous function incorrectly used lowercase 'complete' and 'abandoned' (which doesn't exist)

CREATE OR REPLACE FUNCTION public.cascade_seat_owner_to_rocks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a new primary assignment is made, update all active rocks for that seat
  -- IMPORTANT: This function should ONLY update owner IDs, never touch the status column
  IF TG_OP = 'INSERT' AND NEW.assignment_type = 'Primary' THEN
    -- Update rocks that are not complete (using correct enum value with capital C)
    UPDATE public.eos_rocks
    SET seat_owner_user_id = NEW.user_id,
        owner_id = NEW.user_id,
        updated_at = now()
    WHERE seat_id = NEW.seat_id
      AND (status IS NULL OR status::text NOT IN ('Complete'));
      
    -- Audit log
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
      AND (r.status IS NULL OR r.status::text NOT IN ('Complete'));
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add comment explaining the enum values
COMMENT ON FUNCTION public.cascade_seat_owner_to_rocks() IS 
'Cascades seat owner changes to linked rocks. Uses correct eos_rock_status enum values: Not_Started, On_Track, At_Risk, Off_Track, Complete. Note the capital letters.';