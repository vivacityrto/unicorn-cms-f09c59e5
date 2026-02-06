-- Fix is_staff() to check both global_role and unicorn_role for staff identification
-- This ensures SuperAdmins like Nova (who have unicorn_role but null global_role) are correctly identified

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
      AND (
        -- Check global_role (legacy)
        global_role IN ('superadmin', 'SuperAdmin', 'team_leader', 'Team Leader', 'team_member', 'Team Member')
        OR
        -- Check unicorn_role (current standard)
        unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      )
  )
$$;