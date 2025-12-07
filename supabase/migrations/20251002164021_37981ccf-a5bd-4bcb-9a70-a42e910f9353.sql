-- Step 1: Drop the trigger
DROP TRIGGER IF EXISTS sync_user_type_trigger ON public.users;

-- Step 2: Create new enum
CREATE TYPE public.unicorn_role_new AS ENUM ('Super Admin', 'Admin', 'User');

-- Step 3: Add temporary column
ALTER TABLE public.users ADD COLUMN unicorn_role_new unicorn_role_new;

-- Step 4: Migrate data
UPDATE public.users 
SET unicorn_role_new = CASE 
  WHEN unicorn_role::text = 'SuperAdmin' THEN 'Super Admin'::unicorn_role_new
  WHEN unicorn_role::text = 'Admin' THEN 'Admin'::unicorn_role_new
  WHEN unicorn_role::text = 'User' THEN 'User'::unicorn_role_new
  WHEN unicorn_role::text = 'VivacityAdmin' THEN 'Admin'::unicorn_role_new
  ELSE 'User'::unicorn_role_new
END;

-- Step 5: Drop old column and type with CASCADE
ALTER TABLE public.users DROP COLUMN unicorn_role CASCADE;
DROP TYPE IF EXISTS public.unicorn_role CASCADE;

-- Step 6: Rename
ALTER TABLE public.users RENAME COLUMN unicorn_role_new TO unicorn_role;
ALTER TYPE public.unicorn_role_new RENAME TO unicorn_role;

-- Step 7: Set constraints
ALTER TABLE public.users ALTER COLUMN unicorn_role SET DEFAULT 'User'::unicorn_role;
ALTER TABLE public.users ALTER COLUMN unicorn_role SET NOT NULL;

-- Step 8: Recreate sync_user_type function
CREATE OR REPLACE FUNCTION public.sync_user_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  CASE NEW.unicorn_role
    WHEN 'Super Admin' THEN NEW.user_type := 'Super Admin';
    WHEN 'Admin' THEN NEW.user_type := 'Client';
    WHEN 'User' THEN NEW.user_type := 'Staff';
    ELSE NEW.user_type := NEW.user_type;
  END CASE;
  RETURN NEW;
END;
$function$;

-- Step 9: Recreate trigger
CREATE TRIGGER sync_user_type_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_type();

-- Step 10: Recreate get_all_users_for_superadmin function
CREATE OR REPLACE FUNCTION public.get_all_users_for_superadmin()
RETURNS TABLE(user_uuid uuid, first_name text, last_name text, email text, unicorn_role unicorn_role, disabled boolean, archived boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super Admin role required.';
  END IF;

  RETURN QUERY
  SELECT 
    u.user_uuid,
    u.first_name,
    u.last_name,
    u.email,
    u.unicorn_role,
    u.disabled,
    u.archived,
    u.created_at,
    u.updated_at
  FROM public.users u
  ORDER BY u.first_name ASC;
END;
$function$;

-- Step 11: Fix invitation_tokens table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitation_tokens' AND column_name = 'invited_role') THEN
    ALTER TABLE public.invitation_tokens ADD COLUMN invited_role_new unicorn_role;
    
    UPDATE public.invitation_tokens 
    SET invited_role_new = CASE 
      WHEN invited_role::text = 'SuperAdmin' THEN 'Super Admin'::unicorn_role
      WHEN invited_role::text = 'Admin' THEN 'Admin'::unicorn_role
      WHEN invited_role::text = 'User' THEN 'User'::unicorn_role
      WHEN invited_role::text = 'VivacityAdmin' THEN 'Admin'::unicorn_role
      ELSE 'User'::unicorn_role
    END;
    
    ALTER TABLE public.invitation_tokens DROP COLUMN invited_role;
    ALTER TABLE public.invitation_tokens RENAME COLUMN invited_role_new TO invited_role;
  END IF;
END $$;