-- Add EOS seat role type enum
CREATE TYPE public.eos_seat_role_type AS ENUM (
  'visionary',
  'integrator',
  'leadership_team',
  'functional_lead'
);

-- Add function type enum
CREATE TYPE public.eos_function_type AS ENUM (
  'leadership',
  'operations',
  'finance',
  'delivery',
  'support',
  'sales_marketing'
);

-- Add new columns to accountability_seats for EOS integration
ALTER TABLE public.accountability_seats
ADD COLUMN IF NOT EXISTS eos_role_type eos_seat_role_type,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS gwc_get_it TEXT,
ADD COLUMN IF NOT EXISTS gwc_want_it TEXT,
ADD COLUMN IF NOT EXISTS gwc_capacity TEXT;

-- Add function_type to accountability_functions
ALTER TABLE public.accountability_functions
ADD COLUMN IF NOT EXISTS function_type eos_function_type,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create table to link seats with meeting requirements
CREATE TABLE IF NOT EXISTS public.seat_meeting_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seat_id UUID NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  meeting_type TEXT NOT NULL, -- 'level_10', 'quarterly', 'annual'
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seat_meeting_requirements ENABLE ROW LEVEL SECURITY;

-- RLS policies for seat_meeting_requirements
CREATE POLICY "Staff can view seat meeting requirements"
ON public.seat_meeting_requirements
FOR SELECT
USING (public.is_staff() OR tenant_id IN (
  SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
));

CREATE POLICY "Superadmins can manage seat meeting requirements"
ON public.seat_meeting_requirements
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND global_role = 'superadmin'
  )
);

-- Create view for seat linked data (rocks, meetings, etc.)
CREATE OR REPLACE VIEW public.seat_linked_data AS
SELECT 
  s.id AS seat_id,
  s.tenant_id,
  s.seat_name,
  s.eos_role_type,
  -- Primary owner
  sa.user_id AS primary_owner_id,
  -- Count rocks owned by seat owner
  (SELECT COUNT(*) FROM public.eos_rocks r 
   WHERE r.owner_id = sa.user_id 
   AND r.tenant_id = s.tenant_id
   AND r.status NOT IN ('Complete')) AS active_rocks_count,
  -- Count meetings attended (using 'attended' enum value)
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id 
   AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'attended'
   AND m.status = 'closed') AS meetings_attended_count,
  -- Count missed meetings
  (SELECT COUNT(*) FROM public.eos_meeting_attendees ma
   JOIN public.eos_meetings m ON m.id = ma.meeting_id
   WHERE ma.user_id = sa.user_id 
   AND m.tenant_id = s.tenant_id
   AND ma.attendance_status = 'no_show'
   AND m.status = 'closed') AS meetings_missed_count
FROM public.accountability_seats s
LEFT JOIN public.accountability_seat_assignments sa 
  ON sa.seat_id = s.id 
  AND sa.assignment_type = 'Primary' 
  AND sa.end_date IS NULL;

-- Grant access to the view
GRANT SELECT ON public.seat_linked_data TO authenticated;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accountability_seats_eos_role_type 
ON public.accountability_seats(eos_role_type);

CREATE INDEX IF NOT EXISTS idx_seat_meeting_requirements_seat_id 
ON public.seat_meeting_requirements(seat_id);