-- Allow CSC and Integrator staff to manage Academy Builder resources.
-- Keep the existing SECURITY DEFINER function and all resource RLS policies
-- on the same centralized gate.
CREATE OR REPLACE FUNCTION public.can_manage_academy_resources()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
    OR public.get_current_user_role() IN (
      'Team Leader',
      'Team Member',
      'CSC',
      'Integrator'
    );
$function$;
