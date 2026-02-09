
-- Enable RLS on client_fields (the only public table without RLS)
ALTER TABLE public.client_fields ENABLE ROW LEVEL SECURITY;

-- Allow Vivacity internal staff to read legacy client field data
CREATE POLICY "client_fields_select_vivacity"
ON public.client_fields
FOR SELECT TO authenticated
USING (
  public.is_vivacity_team_safe(auth.uid())
);

-- Allow Vivacity internal staff to manage legacy client field data
CREATE POLICY "client_fields_manage_vivacity"
ON public.client_fields
FOR ALL TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
);
