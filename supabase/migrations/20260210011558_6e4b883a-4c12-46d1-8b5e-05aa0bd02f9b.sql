
-- Step 1: Add columns to user_activity
ALTER TABLE public.user_activity
  ADD COLUMN IF NOT EXISTS tenant_id bigint REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS logout_date timestamptz;

-- Index for tenant-filtered queries
CREATE INDEX IF NOT EXISTS idx_user_activity_tenant_id ON public.user_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_session_id ON public.user_activity(session_id);

-- Step 2: Create legacy_login_snapshot table
CREATE TABLE IF NOT EXISTS public.legacy_login_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  last_sign_in_at timestamptz,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_login_snapshot_user_id_unique UNIQUE (user_id)
);

-- Enable RLS on legacy_login_snapshot
ALTER TABLE public.legacy_login_snapshot ENABLE ROW LEVEL SECURITY;

-- RLS: SuperAdmins and Vivacity staff can read all
CREATE POLICY "legacy_snapshot_select_staff"
  ON public.legacy_login_snapshot FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

-- RLS: Users can read their own snapshot
CREATE POLICY "legacy_snapshot_select_own"
  ON public.legacy_login_snapshot FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Only SuperAdmins can insert (migration)
CREATE POLICY "legacy_snapshot_insert_admin"
  ON public.legacy_login_snapshot FOR INSERT
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Step 3: RLS policies for user_activity (if not already present)
-- Drop existing policies to recreate cleanly
DO $$
BEGIN
  -- Check and create policies only if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity' AND policyname = 'user_activity_select_own') THEN
    EXECUTE 'CREATE POLICY "user_activity_select_own" ON public.user_activity FOR SELECT USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity' AND policyname = 'user_activity_select_staff') THEN
    EXECUTE 'CREATE POLICY "user_activity_select_staff" ON public.user_activity FOR SELECT USING (public.is_vivacity_team_safe(auth.uid()))';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity' AND policyname = 'user_activity_select_tenant_admin') THEN
    EXECUTE 'CREATE POLICY "user_activity_select_tenant_admin" ON public.user_activity FOR SELECT USING (
      public.has_tenant_access_safe(tenant_id, auth.uid())
    )';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity' AND policyname = 'user_activity_insert_own') THEN
    EXECUTE 'CREATE POLICY "user_activity_insert_own" ON public.user_activity FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Step 4: DB function to auto-record login on auth sign-in
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    INSERT INTO public.user_activity (user_id, login_date)
    VALUES (NEW.id, COALESCE(NEW.last_sign_in_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for login tracking
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_login();
