-- Now update existing users with the new user_type values
UPDATE public.users
SET user_type = CASE
  WHEN unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member') THEN 'Vivacity'
  WHEN unicorn_role = 'Admin' THEN 'Client Parent'
  WHEN unicorn_role = 'User' THEN 'Client Child'
  ELSE user_type
END;

-- Update the trigger function to use correct user_type values
CREATE OR REPLACE FUNCTION public.set_user_type_from_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member') THEN
    NEW.user_type := 'Vivacity';
  ELSIF NEW.unicorn_role = 'Admin' THEN
    NEW.user_type := 'Client Parent';
  ELSIF NEW.unicorn_role = 'User' THEN
    NEW.user_type := 'Client Child';
  END IF;
  RETURN NEW;
END;
$$;