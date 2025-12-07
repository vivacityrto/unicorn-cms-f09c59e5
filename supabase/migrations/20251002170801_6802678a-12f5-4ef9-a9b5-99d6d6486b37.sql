-- Drop trigger that references organisation_id
DROP TRIGGER IF EXISTS set_user_organisation_trigger ON public.users;

-- Update get_current_user_tenant function to use tenant_id instead of organisation_id
CREATE OR REPLACE FUNCTION public.get_current_user_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tenant_id_val uuid;
BEGIN
  SELECT tenant_id INTO tenant_id_val 
  FROM public.users 
  WHERE user_uuid = auth.uid() 
  LIMIT 1;
  
  RETURN tenant_id_val;
END;
$function$;

-- Update set_user_organisation function to use tenant_id instead of organisation_id
CREATE OR REPLACE FUNCTION public.set_user_organisation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If user is being created with Admin or User role and no tenant_id set
  IF NEW.unicorn_role IN ('Admin', 'User') AND NEW.tenant_id IS NULL THEN
    -- Try to find tenant_id from invitation token
    SELECT organisation_id INTO NEW.tenant_id
    FROM public.invitation_tokens it
    WHERE it.email = NEW.email 
    AND it.used_at IS NULL 
    AND it.expires_at > now()
    ORDER BY it.created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$function$;