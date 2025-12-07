-- Update existing 'Vivacity' values to 'Vivacity Team'
UPDATE public.users
SET user_type = 'Vivacity Team'
WHERE user_type = 'Vivacity';

-- Update the trigger function to use 'Vivacity Team'
CREATE OR REPLACE FUNCTION public.set_user_type_from_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member') THEN
    NEW.user_type := 'Vivacity Team';
  ELSIF NEW.unicorn_role = 'Admin' THEN
    NEW.user_type := 'Client Parent';
  ELSIF NEW.unicorn_role = 'User' THEN
    NEW.user_type := 'Client Child';
  END IF;
  RETURN NEW;
END;
$$;