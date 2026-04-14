
-- Create tenant_relationships table
CREATE TABLE public.tenant_relationships (
  id bigserial PRIMARY KEY,
  parent_tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  child_tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT tenant_rel_unique UNIQUE (parent_tenant_id, child_tenant_id),
  CONSTRAINT no_self_link CHECK (parent_tenant_id != child_tenant_id)
);

-- Indexes for FK lookups
CREATE INDEX idx_tenant_rel_parent ON public.tenant_relationships(parent_tenant_id);
CREATE INDEX idx_tenant_rel_child ON public.tenant_relationships(child_tenant_id);

-- Wire updated_at trigger
CREATE TRIGGER set_tenant_relationships_updated_at
  BEFORE UPDATE ON public.tenant_relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE public.tenant_relationships ENABLE ROW LEVEL SECURITY;

-- Vivacity staff can read all relationships
CREATE POLICY "tenant_rel_select_staff"
  ON public.tenant_relationships FOR SELECT
  TO authenticated
  USING (is_vivacity());

-- Tenant members can read relationships involving their tenant
CREATE POLICY "tenant_rel_select_member"
  ON public.tenant_relationships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
      AND (tu.tenant_id = parent_tenant_id OR tu.tenant_id = child_tenant_id)
    )
  );

-- Vivacity staff can insert relationships
CREATE POLICY "tenant_rel_insert_staff"
  ON public.tenant_relationships FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity());

-- Vivacity staff can delete relationships
CREATE POLICY "tenant_rel_delete_staff"
  ON public.tenant_relationships FOR DELETE
  TO authenticated
  USING (is_vivacity());

-- Vivacity staff can update relationships (e.g. notes)
CREATE POLICY "tenant_rel_update_staff"
  ON public.tenant_relationships FOR UPDATE
  TO authenticated
  USING (is_vivacity())
  WITH CHECK (is_vivacity());
