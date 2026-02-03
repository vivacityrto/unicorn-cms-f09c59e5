-- Add seat ownership columns to eos_rocks
ALTER TABLE public.eos_rocks 
ADD COLUMN IF NOT EXISTS seat_id UUID REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS seat_owner_user_id UUID;

-- Create index for seat lookups
CREATE INDEX IF NOT EXISTS idx_eos_rocks_seat_id ON public.eos_rocks(seat_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_seat_owner ON public.eos_rocks(seat_owner_user_id);

-- Function to sync rock owner from seat assignment
CREATE OR REPLACE FUNCTION public.sync_rock_owner_from_seat()
RETURNS TRIGGER AS $$
DECLARE
  v_primary_owner_id UUID;
BEGIN
  -- Only proceed if seat_id is set
  IF NEW.seat_id IS NOT NULL THEN
    -- Get primary owner from seat assignments
    SELECT user_id INTO v_primary_owner_id
    FROM public.accountability_seat_assignments
    WHERE seat_id = NEW.seat_id
      AND assignment_type = 'Primary'
      AND (end_date IS NULL OR end_date > now())
    ORDER BY start_date DESC
    LIMIT 1;
    
    -- Set derived owner
    NEW.seat_owner_user_id := v_primary_owner_id;
    
    -- Also update owner_id for backwards compatibility
    IF v_primary_owner_id IS NOT NULL THEN
      NEW.owner_id := v_primary_owner_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for new rocks and updates
DROP TRIGGER IF EXISTS tr_sync_rock_owner_from_seat ON public.eos_rocks;
CREATE TRIGGER tr_sync_rock_owner_from_seat
BEFORE INSERT OR UPDATE OF seat_id ON public.eos_rocks
FOR EACH ROW
EXECUTE FUNCTION public.sync_rock_owner_from_seat();

-- Function to cascade seat owner changes to rocks
CREATE OR REPLACE FUNCTION public.cascade_seat_owner_to_rocks()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new primary assignment is made, update all active rocks for that seat
  IF TG_OP = 'INSERT' AND NEW.assignment_type = 'Primary' THEN
    UPDATE public.eos_rocks
    SET seat_owner_user_id = NEW.user_id,
        owner_id = NEW.user_id,
        updated_at = now()
    WHERE seat_id = NEW.seat_id
      AND (status IS NULL OR status NOT IN ('complete', 'abandoned'));
      
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
      AND (r.status IS NULL OR r.status NOT IN ('complete', 'abandoned'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for seat assignment changes
DROP TRIGGER IF EXISTS tr_cascade_seat_owner_to_rocks ON public.accountability_seat_assignments;
CREATE TRIGGER tr_cascade_seat_owner_to_rocks
AFTER INSERT ON public.accountability_seat_assignments
FOR EACH ROW
EXECUTE FUNCTION public.cascade_seat_owner_to_rocks();