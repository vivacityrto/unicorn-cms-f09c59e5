-- Rollback for 20261029120000_evidence_item_client_update_guard.sql.
-- Restores the previous single UPDATE policy and the anon UPDATE grant, and drops the guard and
-- the scope-aware helper. Only run the helper drop if no later migration depends on it.

DROP TRIGGER IF EXISTS trg_enforce_evidence_item_client_update ON public.evidence_request_items;
DROP FUNCTION IF EXISTS public.enforce_evidence_item_client_update();

DROP POLICY IF EXISTS evidence_request_items_update_client ON public.evidence_request_items;
DROP POLICY IF EXISTS evidence_request_items_update_staff ON public.evidence_request_items;

CREATE POLICY evidence_request_items_update
  ON public.evidence_request_items FOR UPDATE
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.evidence_requests r
      WHERE r.id = evidence_request_items.request_id
        AND public.user_has_tenant_access(r.tenant_id)
    )
  );

GRANT UPDATE ON public.evidence_request_items TO anon;

DROP FUNCTION IF EXISTS public.user_has_full_tenant_access(bigint);

NOTIFY pgrst, 'reload schema';
