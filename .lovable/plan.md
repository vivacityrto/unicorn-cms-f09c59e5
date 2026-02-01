
# Fix Kelly Xu's Password Reset and Magic Link Issues

## Root Cause Identified

Kelly Xu cannot use Password Reset or Magic Link because of a **UUID mismatch** between her auth user and her profile:

| Table | UUID | Email | Status |
|-------|------|-------|--------|
| `auth.users` | `f32f8e34-...` (new) | kelly@vivacity.com.au | Active |
| `profiles` | `f32f8e34-...` (new) | kelly@vivacity.com.au | Created today |
| `public.users` | `f38aa1db-...` (old) | kelly@vivacity.com.au | Original record |

The original auth user (`f38aa1db-...`) was **deleted** and a new one was created (`f32f8e34-...`). However, the `public.users` table still references the old UUID.

### Why Magic Link Fails with "Database error saving new user"

When `signInWithOtp()` runs, Supabase's OTP system creates a new auth user if none exists. The `handle_new_auth_user()` trigger then tries to insert into `profiles`:

```sql
-- Current trigger logic (buggy)
INSERT INTO profiles (user_id, email, username, ...)
ON CONFLICT (user_id) DO UPDATE ...
```

The problem: The `ON CONFLICT` only handles `user_id` conflicts, but there's a **UNIQUE constraint on `email`** (`profiles_email_key`). When a new auth user is created with an existing email but different UUID, the insert fails.

## Solution

Two fixes are required:

### Fix 1: Update `handle_new_auth_user()` Trigger

Modify the trigger to handle email conflicts gracefully by using a multi-column conflict target or checking for existing emails first.

```sql
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
  -- Check if a profile already exists with this email
  SELECT id INTO v_existing_profile_id 
  FROM public.profiles 
  WHERE email = NEW.email;

  IF v_existing_profile_id IS NOT NULL THEN
    -- Update existing profile to point to new auth user
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
```

### Fix 2: Sync Kelly's `public.users` Record

Update Kelly's user record to point to her new auth UUID:

```sql
UPDATE public.users
SET user_uuid = 'f32f8e34-95b8-4702-8c86-a1815f6bffec',
    updated_at = now()
WHERE email = 'kelly@vivacity.com.au'
  AND user_uuid = 'f38aa1db-32ed-4009-939d-e338807fe502';
```

### Fix 3: Enhance `handle_new_user()` Trigger

Similarly update the `handle_new_user()` function to handle email conflicts when syncing to `public.users`:

```sql
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
    -- Insert new user
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
```

## Expected Results

After these fixes:
- Kelly Xu will be able to request password resets without database errors
- Magic links will work for all users, even if their auth user was recreated
- The system will gracefully handle UUID mismatches between auth.users and public tables
- Future user re-invites or account recreations will not break authentication

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_fix_auth_trigger_email_conflicts.sql` | Fix triggers and sync Kelly's UUID |

### Audit Impact

No audit data is lost - Kelly's original audit trail is preserved. The user record is simply updated to reference the correct auth UUID.

### Testing Checklist

After implementation:
- Request password reset for kelly@vivacity.com.au - should send email without errors
- Request magic link for kelly@vivacity.com.au - should send OTP without "Database error"
- Verify Kelly can log in with the new password/magic link
- Confirm Last Login updates correctly
