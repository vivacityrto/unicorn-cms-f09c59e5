-- Fix role checking functions to use unicorn_role instead of user_type

-- Update get_current_user_role to read from unicorn_role column
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  role_val text;
BEGIN
  SELECT unicorn_role::text INTO role_val
  FROM public.users 
  WHERE user_uuid = auth.uid() 
  LIMIT 1;
  
  RETURN role_val;
END;
$function$;

-- Update is_super_admin to use the corrected function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_user_role() IN ('Super Admin', 'SuperAdmin');
END;
$function$;

-- Update is_vivacity_user to check unicorn_role
CREATE OR REPLACE FUNCTION public.is_vivacity_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_user_role() IN ('Super Admin', 'SuperAdmin');
END;
$function$;