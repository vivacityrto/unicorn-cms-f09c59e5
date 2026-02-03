-- Create audit_restricted_actions table for tracking permission friction
CREATE TABLE IF NOT EXISTS public.audit_restricted_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id bigint REFERENCES public.tenants(id) ON DELETE SET NULL,
  action_attempted text NOT NULL,
  permission_required text,
  user_role text,
  page_path text,
  created_at timestamptz DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.audit_restricted_actions IS 'Logs attempts to perform restricted actions for analytics and friction identification';

-- Create index for querying by user and tenant
CREATE INDEX IF NOT EXISTS idx_audit_restricted_actions_user_id ON public.audit_restricted_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_restricted_actions_tenant_id ON public.audit_restricted_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_restricted_actions_created_at ON public.audit_restricted_actions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.audit_restricted_actions ENABLE ROW LEVEL SECURITY;

-- Staff (Vivacity team) can read for analytics
CREATE POLICY "Staff can view restricted action logs"
  ON public.audit_restricted_actions FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- Authenticated users can insert their own logs
CREATE POLICY "Users can insert their own restriction logs"
  ON public.audit_restricted_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);