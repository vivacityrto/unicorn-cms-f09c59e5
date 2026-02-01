-- Fix auth triggers to handle email conflicts when auth users are recreated
-- This resolves "Database error saving new user" errors for magic links/password resets

-- Fix 1: Update handle_new_auth_user() to check for existing email before inserting
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_username text;
  v_existing_profile_id bigint;
BEGIN
  -- Check if a profile already exists with this email (handles recreated auth users)
  SELECT id INTO v_existing_profile_id 
  FROM public.profiles 
  WHERE email = NEW.email;

  IF v_existing_profile_id IS NOT NULL THEN
    -- Update existing profile to point to new auth user UUID
    UPDATE public.profiles
    SET user_id = NEW.id,
        updated_at = now()
    WHERE id = v_existing_profile_id;
  ELSE
    -- Create new profile
    v_username := public.generate_username(NEW.email, NEW.id);

    INSERT INTO public.profiles (user_id, email, username, created_at, updated_at)
    VALUES (NEW.id, NEW.email, v_username, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET email = excluded.email,
          username = COALESCE(public.profiles.username, excluded.username),
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Fix 2: Update handle_new_user() to check for existing email before inserting
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user already exists by email (handles re-created auth users)
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = LOWER(NEW.email)) THEN
    -- Update existing user to point to new auth UUID
    UPDATE public.users
    SET user_uuid = NEW.id,
        updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email);
  ELSIF NOT EXISTS (SELECT 1 FROM public.users WHERE user_uuid = NEW.id) THEN
    -- Insert new user only if no record exists with this UUID
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, phone, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE((NEW.raw_user_meta_data->>'unicorn_role')::unicorn_role, 'User'::unicorn_role),
      COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type_enum, 'Member'::user_type_enum),
      COALESCE((NEW.raw_user_meta_data->>'tenant_id')::bigint, NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      now(), now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 3: Sync Kelly Xu's public.users record to her new auth UUID
UPDATE public.users
SET user_uuid = 'f32f8e34-95b8-4702-8c86-a1815f6bffec',
    updated_at = now()
WHERE LOWER(email) = LOWER('kelly@vivacity.com.au')
  AND user_uuid = 'f38aa1db-32ed-4009-939d-e338807fe502';