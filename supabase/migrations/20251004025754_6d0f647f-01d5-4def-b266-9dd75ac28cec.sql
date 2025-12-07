-- Fix the handle_new_user trigger to properly cast user_type enum
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user already exists by user_uuid OR email
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = NEW.id OR LOWER(email) = LOWER(NEW.email)
  ) THEN
    -- Insert new user profile with properly casted user_type
    INSERT INTO public.users (
      user_uuid, 
      email, 
      first_name, 
      last_name,
      unicorn_role,
      user_type,
      tenant_id,
      phone,
      created_at, 
      updated_at
    )
    VALUES (
      NEW.id, 
      NEW.email, 
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE((NEW.raw_user_meta_data->>'unicorn_role')::unicorn_role, 'User'::unicorn_role),
      COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type_enum, 'Staff'::user_type_enum),
      COALESCE((NEW.raw_user_meta_data->>'tenant_id')::bigint, NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      NOW(), 
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;