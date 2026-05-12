-- 1. INSERT policy for cycle owners
CREATE POLICY "pdp_cycles: users insert own"
  ON public.pdp_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('planning', 'active')
    AND (
      tenant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id = pdp_cycles.tenant_id
      )
    )
  );

-- 2. Replace UPDATE policy with hardened version
DROP POLICY "pdp_cycles: users update own while open" ON public.pdp_cycles;

CREATE POLICY "pdp_cycles: users update own while open"
  ON public.pdp_cycles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('planning', 'active', 'under_review')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('planning', 'active', 'under_review', 'completed')
    AND (completed_by IS NULL OR completed_by = auth.uid())
  );