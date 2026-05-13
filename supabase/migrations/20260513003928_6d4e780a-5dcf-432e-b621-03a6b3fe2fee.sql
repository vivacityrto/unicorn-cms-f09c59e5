BEGIN;

DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;

CREATE POLICY "pdp_cycles: tenant admins view their tenant"
ON public.pdp_cycles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = pdp_cycles.tenant_id
      AND tu.access_scope = 'full'::text
      AND tu.relationship_role IN ('primary_contact', 'secondary_contact')
  )
);

COMMIT;