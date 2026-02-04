-- Create team members table for Functional Lead direct reports
CREATE TABLE public.eos_function_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES public.accountability_functions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.users(user_uuid),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT unique_function_user UNIQUE (function_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_function_team_members_function ON public.eos_function_team_members(function_id, sort_order);
CREATE INDEX idx_function_team_members_tenant ON public.eos_function_team_members(tenant_id);

-- Enable RLS
ALTER TABLE public.eos_function_team_members ENABLE ROW LEVEL SECURITY;

-- RLS policy: Vivacity Team users can read/write
CREATE POLICY "Vivacity team can manage function team members"
ON public.eos_function_team_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
  )
);