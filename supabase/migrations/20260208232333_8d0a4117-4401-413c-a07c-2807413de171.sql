-- Add is_vivacity_internal column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_vivacity_internal boolean NOT NULL DEFAULT false;

-- Create index for fast internal user lookups
CREATE INDEX IF NOT EXISTS idx_users_is_vivacity_internal ON public.users(is_vivacity_internal) WHERE is_vivacity_internal = true;

-- Backfill: Set is_vivacity_internal = true for Vivacity roles
UPDATE public.users
SET is_vivacity_internal = true
WHERE unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND archived = false;

-- Also update using global_role for legacy SuperAdmins
UPDATE public.users
SET is_vivacity_internal = true
WHERE global_role = 'SuperAdmin'
  AND archived = false;

-- Create security helper function for checking Vivacity internal access
CREATE OR REPLACE FUNCTION public.is_vivacity_internal_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = p_user_id
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
$$;

COMMENT ON FUNCTION public.is_vivacity_internal_safe IS 'Recursion-safe check for Vivacity internal staff access. Used in RLS policies for Ask Viv features.';

-- Create audit_ask_viv_access_denied table for logging blocked attempts
CREATE TABLE IF NOT EXISTS public.audit_ask_viv_access_denied (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_role text,
  endpoint text NOT NULL,
  reason text NOT NULL DEFAULT 'not_vivacity_internal',
  request_context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying denied access logs
CREATE INDEX IF NOT EXISTS idx_audit_ask_viv_access_denied_user ON public.audit_ask_viv_access_denied(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_ask_viv_access_denied_created ON public.audit_ask_viv_access_denied(created_at DESC);

-- Enable RLS on audit table
ALTER TABLE public.audit_ask_viv_access_denied ENABLE ROW LEVEL SECURITY;

-- Only Vivacity staff can read the denied access logs
CREATE POLICY "ask_viv_denied_logs_read_staff"
ON public.audit_ask_viv_access_denied
FOR SELECT
TO authenticated
USING (public.is_vivacity_internal_safe(auth.uid()));

-- System can insert logs (via service role)
CREATE POLICY "ask_viv_denied_logs_insert"
ON public.audit_ask_viv_access_denied
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Drop existing RLS policies on ai_interaction_logs that are too permissive
DROP POLICY IF EXISTS "ai logs insert own" ON public.ai_interaction_logs;
DROP POLICY IF EXISTS "ai logs read own" ON public.ai_interaction_logs;

-- Create strict Vivacity-only policies for ai_interaction_logs
CREATE POLICY "vivacity_internal_insert_ai_logs"
ON public.ai_interaction_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_vivacity_internal_safe(auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "vivacity_internal_read_ai_logs"
ON public.ai_interaction_logs
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_internal_safe(auth.uid())
);

-- Update vector_embeddings RLS to use the new helper
DROP POLICY IF EXISTS "vector_embeddings_read_staff" ON public.vector_embeddings;
DROP POLICY IF EXISTS "vector_embeddings_read_tenant" ON public.vector_embeddings;
DROP POLICY IF EXISTS "vector_embeddings_write_admin" ON public.vector_embeddings;

-- Vivacity internal can read all embeddings
CREATE POLICY "vector_embeddings_read_vivacity"
ON public.vector_embeddings
FOR SELECT
TO authenticated
USING (public.is_vivacity_internal_safe(auth.uid()));

-- Only SuperAdmin can write embeddings
CREATE POLICY "vector_embeddings_write_superadmin"
ON public.vector_embeddings
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Update vector_index_logs RLS
DROP POLICY IF EXISTS "vector_index_logs_read_staff" ON public.vector_index_logs;
DROP POLICY IF EXISTS "vector_index_logs_write_admin" ON public.vector_index_logs;

CREATE POLICY "vector_index_logs_read_vivacity"
ON public.vector_index_logs
FOR SELECT
TO authenticated
USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vector_index_logs_write_superadmin"
ON public.vector_index_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Add trigger to auto-set is_vivacity_internal when unicorn_role changes
CREATE OR REPLACE FUNCTION public.sync_is_vivacity_internal()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_vivacity_internal := NEW.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_is_vivacity_internal ON public.users;
CREATE TRIGGER trg_sync_is_vivacity_internal
  BEFORE INSERT OR UPDATE OF unicorn_role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_is_vivacity_internal();

-- Comment on column
COMMENT ON COLUMN public.users.is_vivacity_internal IS 'True for Vivacity internal staff (Super Admin, Team Leader, Team Member). Auto-synced from unicorn_role.';