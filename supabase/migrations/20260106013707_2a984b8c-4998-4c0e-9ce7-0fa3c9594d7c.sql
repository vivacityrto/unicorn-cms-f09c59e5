-- Create the eos_user_roles table that RLS functions depend on
CREATE TABLE IF NOT EXISTS public.eos_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.eos_role NOT NULL DEFAULT 'participant',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  UNIQUE(user_id, tenant_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_eos_user_roles_user_tenant ON public.eos_user_roles(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_eos_user_roles_tenant ON public.eos_user_roles(tenant_id);

-- Enable RLS
ALTER TABLE public.eos_user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for eos_user_roles
-- Users can read their own role
CREATE POLICY "Users can read own EOS role"
  ON public.eos_user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can read all roles
CREATE POLICY "Super admins can read all EOS roles"
  ON public.eos_user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
        AND global_role = 'Super Admin'
    )
  );

-- Super admins can manage all roles
CREATE POLICY "Super admins can manage EOS roles"
  ON public.eos_user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
        AND global_role = 'Super Admin'
    )
  );

-- Seed default participant roles for existing users with tenant_id
INSERT INTO public.eos_user_roles (user_id, tenant_id, role, assigned_at)
SELECT 
  u.user_uuid,
  u.tenant_id,
  CASE 
    WHEN u.global_role = 'Super Admin' THEN 'admin'::public.eos_role
    ELSE 'participant'::public.eos_role
  END,
  now()
FROM public.users u
WHERE u.tenant_id IS NOT NULL
  AND u.user_uuid IS NOT NULL
ON CONFLICT (user_id, tenant_id) DO NOTHING;