-- Add succession and contingency planning fields to accountability_seats
ALTER TABLE public.accountability_seats
ADD COLUMN IF NOT EXISTS backup_owner_user_id uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cover_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS critical_seat boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS cover_notes text;

-- Add constraint: backup owner cannot be the primary owner
-- We'll enforce this in application code since we need to check assignments table

-- Create audit table for succession events
CREATE TABLE IF NOT EXISTS public.audit_succession_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id),
  seat_id uuid REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('backup_assigned', 'backup_removed', 'seat_marked_critical', 'seat_unmarked_critical', 'cover_activated', 'cover_deactivated')),
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.audit_succession_events ENABLE ROW LEVEL SECURITY;

-- RLS policy for audit_succession_events (staff can read, system can write)
CREATE POLICY "Staff can view succession audit events"
ON public.audit_succession_events
FOR SELECT
TO authenticated
USING (public.is_staff());

-- Create view for seats with succession status
CREATE OR REPLACE VIEW public.seat_succession_status AS
SELECT 
  s.id as seat_id,
  s.tenant_id,
  s.seat_name,
  s.critical_seat,
  s.cover_required,
  s.cover_notes,
  s.backup_owner_user_id,
  backup.first_name as backup_first_name,
  backup.last_name as backup_last_name,
  backup.email as backup_email,
  backup.avatar_url as backup_avatar_url,
  -- Get primary owner from assignments
  (
    SELECT user_id 
    FROM public.accountability_seat_assignments 
    WHERE seat_id = s.id 
      AND assignment_type = 'Primary' 
      AND (end_date IS NULL OR end_date > now())
    LIMIT 1
  ) as primary_owner_user_id,
  -- Check if primary is on leave (simplified - uses leave_from/leave_until from users table)
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.accountability_seat_assignments a ON a.user_id = u.user_uuid
      WHERE a.seat_id = s.id 
        AND a.assignment_type = 'Primary'
        AND (a.end_date IS NULL OR a.end_date > now())
        AND u.leave_from IS NOT NULL 
        AND u.leave_until IS NOT NULL
        AND now() BETWEEN u.leave_from::timestamptz AND u.leave_until::timestamptz
    ) THEN true
    ELSE false
  END as primary_on_leave,
  -- Check if backup is on leave
  CASE 
    WHEN s.backup_owner_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = s.backup_owner_user_id
        AND u.leave_from IS NOT NULL 
        AND u.leave_until IS NOT NULL
        AND now() BETWEEN u.leave_from::timestamptz AND u.leave_until::timestamptz
    ) THEN true
    ELSE false
  END as backup_on_leave,
  -- Coverage status
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.accountability_seat_assignments 
      WHERE seat_id = s.id 
        AND assignment_type = 'Primary' 
        AND (end_date IS NULL OR end_date > now())
    ) THEN 'uncovered'
    WHEN s.backup_owner_user_id IS NOT NULL THEN 'fully_covered'
    ELSE 'primary_only'
  END as coverage_status
FROM public.accountability_seats s
LEFT JOIN public.users backup ON backup.user_uuid = s.backup_owner_user_id;

-- Grant access to the view
GRANT SELECT ON public.seat_succession_status TO authenticated;