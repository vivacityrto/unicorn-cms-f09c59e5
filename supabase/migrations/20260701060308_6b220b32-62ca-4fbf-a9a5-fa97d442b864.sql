DROP POLICY IF EXISTS tga_scope_items_select ON public.tga_scope_items;
CREATE POLICY tga_scope_items_select ON public.tga_scope_items
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.tga_scope_items FROM anon;