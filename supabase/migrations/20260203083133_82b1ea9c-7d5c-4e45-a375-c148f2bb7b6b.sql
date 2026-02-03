-- Part A: Add is_system_tenant flag to tenants table
-- This marks Vivacity Coaching & Consulting as the internal system tenant

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS is_system_tenant BOOLEAN NOT NULL DEFAULT false;

-- Mark Vivacity as the system tenant
UPDATE public.tenants 
SET is_system_tenant = true 
WHERE id = 6372;

-- Ensure only one system tenant exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_system_tenant 
ON public.tenants (is_system_tenant) 
WHERE is_system_tenant = true;

-- Part B: Create a security definer function to check if user is Vivacity Team
-- This prevents RLS recursion and centralizes the check

CREATE OR REPLACE FUNCTION public.is_vivacity_team(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = p_user_id
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_vivacity_team(uuid) TO authenticated;

-- Part C: Create a function to get the system tenant ID
CREATE OR REPLACE FUNCTION public.get_system_tenant_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE is_system_tenant = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_tenant_id() TO authenticated;

-- Part D: Add RLS policies for Accountability Chart tables
-- These ensure only Vivacity team members can access EOS data

-- Drop existing policies if they exist and recreate with proper restrictions
DO $$
BEGIN
  -- accountability_charts policies
  DROP POLICY IF EXISTS "accountability_charts_select" ON public.accountability_charts;
  DROP POLICY IF EXISTS "accountability_charts_insert" ON public.accountability_charts;
  DROP POLICY IF EXISTS "accountability_charts_update" ON public.accountability_charts;
  DROP POLICY IF EXISTS "accountability_charts_delete" ON public.accountability_charts;
  
  -- accountability_functions policies
  DROP POLICY IF EXISTS "accountability_functions_select" ON public.accountability_functions;
  DROP POLICY IF EXISTS "accountability_functions_insert" ON public.accountability_functions;
  DROP POLICY IF EXISTS "accountability_functions_update" ON public.accountability_functions;
  DROP POLICY IF EXISTS "accountability_functions_delete" ON public.accountability_functions;
  
  -- accountability_seats policies
  DROP POLICY IF EXISTS "accountability_seats_select" ON public.accountability_seats;
  DROP POLICY IF EXISTS "accountability_seats_insert" ON public.accountability_seats;
  DROP POLICY IF EXISTS "accountability_seats_update" ON public.accountability_seats;
  DROP POLICY IF EXISTS "accountability_seats_delete" ON public.accountability_seats;
  
  -- accountability_seat_roles policies
  DROP POLICY IF EXISTS "accountability_seat_roles_select" ON public.accountability_seat_roles;
  DROP POLICY IF EXISTS "accountability_seat_roles_insert" ON public.accountability_seat_roles;
  DROP POLICY IF EXISTS "accountability_seat_roles_update" ON public.accountability_seat_roles;
  DROP POLICY IF EXISTS "accountability_seat_roles_delete" ON public.accountability_seat_roles;
  
  -- accountability_seat_assignments policies
  DROP POLICY IF EXISTS "accountability_seat_assignments_select" ON public.accountability_seat_assignments;
  DROP POLICY IF EXISTS "accountability_seat_assignments_insert" ON public.accountability_seat_assignments;
  DROP POLICY IF EXISTS "accountability_seat_assignments_update" ON public.accountability_seat_assignments;
  DROP POLICY IF EXISTS "accountability_seat_assignments_delete" ON public.accountability_seat_assignments;
END $$;

-- Enable RLS on all accountability tables
ALTER TABLE public.accountability_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seat_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seat_assignments ENABLE ROW LEVEL SECURITY;

-- Accountability Charts: Only Vivacity team can read/write, must belong to system tenant
CREATE POLICY "accountability_charts_select" ON public.accountability_charts
FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "accountability_charts_insert" ON public.accountability_charts
FOR INSERT WITH CHECK (
  public.is_vivacity_team() 
  AND tenant_id = public.get_system_tenant_id()
);

CREATE POLICY "accountability_charts_update" ON public.accountability_charts
FOR UPDATE USING (public.is_vivacity_team());

CREATE POLICY "accountability_charts_delete" ON public.accountability_charts
FOR DELETE USING (public.is_vivacity_team());

-- Accountability Functions: Only Vivacity team
CREATE POLICY "accountability_functions_select" ON public.accountability_functions
FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "accountability_functions_insert" ON public.accountability_functions
FOR INSERT WITH CHECK (
  public.is_vivacity_team()
  AND tenant_id = public.get_system_tenant_id()
);

CREATE POLICY "accountability_functions_update" ON public.accountability_functions
FOR UPDATE USING (public.is_vivacity_team());

CREATE POLICY "accountability_functions_delete" ON public.accountability_functions
FOR DELETE USING (public.is_vivacity_team());

-- Accountability Seats: Only Vivacity team
CREATE POLICY "accountability_seats_select" ON public.accountability_seats
FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "accountability_seats_insert" ON public.accountability_seats
FOR INSERT WITH CHECK (
  public.is_vivacity_team()
  AND tenant_id = public.get_system_tenant_id()
);

CREATE POLICY "accountability_seats_update" ON public.accountability_seats
FOR UPDATE USING (public.is_vivacity_team());

CREATE POLICY "accountability_seats_delete" ON public.accountability_seats
FOR DELETE USING (public.is_vivacity_team());

-- Accountability Seat Roles: Only Vivacity team
CREATE POLICY "accountability_seat_roles_select" ON public.accountability_seat_roles
FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "accountability_seat_roles_insert" ON public.accountability_seat_roles
FOR INSERT WITH CHECK (
  public.is_vivacity_team()
  AND tenant_id = public.get_system_tenant_id()
);

CREATE POLICY "accountability_seat_roles_update" ON public.accountability_seat_roles
FOR UPDATE USING (public.is_vivacity_team());

CREATE POLICY "accountability_seat_roles_delete" ON public.accountability_seat_roles
FOR DELETE USING (public.is_vivacity_team());

-- Accountability Seat Assignments: Only Vivacity team
CREATE POLICY "accountability_seat_assignments_select" ON public.accountability_seat_assignments
FOR SELECT USING (public.is_vivacity_team());

CREATE POLICY "accountability_seat_assignments_insert" ON public.accountability_seat_assignments
FOR INSERT WITH CHECK (
  public.is_vivacity_team()
  AND tenant_id = public.get_system_tenant_id()
);

CREATE POLICY "accountability_seat_assignments_update" ON public.accountability_seat_assignments
FOR UPDATE USING (public.is_vivacity_team());

CREATE POLICY "accountability_seat_assignments_delete" ON public.accountability_seat_assignments
FOR DELETE USING (public.is_vivacity_team());