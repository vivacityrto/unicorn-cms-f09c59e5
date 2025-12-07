-- Create user_type enum
CREATE TYPE public.user_type_enum AS ENUM ('Vivacity', 'Client', 'Member');

-- Add user_type column
ALTER TABLE public.users ADD COLUMN user_type public.user_type_enum;

-- Migrate existing data with mapping
UPDATE public.users
SET user_type = CASE
  WHEN unicorn_role = 'Super Admin' THEN 'Vivacity'::user_type_enum
  WHEN unicorn_role = 'Admin' THEN 'Client'::user_type_enum
  WHEN unicorn_role = 'User' THEN 'Member'::user_type_enum
END;

-- Make user_type NOT NULL after data migration
ALTER TABLE public.users ALTER COLUMN user_type SET NOT NULL;

-- Update get_current_user_role function to use user_type
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  role_val text;
BEGIN
  SELECT 
    CASE 
      WHEN user_type = 'Vivacity' THEN 'Super Admin'
      WHEN user_type = 'Client' THEN 'Admin'
      WHEN user_type = 'Member' THEN 'User'
    END INTO role_val
  FROM public.users 
  WHERE user_uuid = auth.uid() 
  LIMIT 1;
  
  RETURN role_val;
END;
$function$;

-- Create function to get user_type directly
CREATE OR REPLACE FUNCTION public.get_current_user_type()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  type_val text;
BEGIN
  SELECT user_type::text INTO type_val
  FROM public.users 
  WHERE user_uuid = auth.uid() 
  LIMIT 1;
  
  RETURN type_val;
END;
$function$;