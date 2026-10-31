-- Limit what a client can change on an evidence request item.
--
-- Until now the UPDATE policy on evidence_request_items let any member of the tenant change any
-- column of any of their tenant's items (no WITH CHECK, no column limit), and `anon` held UPDATE
-- on every column. A client only ever needs to attach their file: set received_document_id,
-- received_at and status = 'received'. Review decisions (accepted / rejected / resubmit_requested,
-- review notes, reviewer) belong to staff.
--
-- 1. user_has_full_tenant_access(): tenant membership that respects access_scope (the older
--    user_has_tenant_access() ignores it, so academy_only users passed). New helper; the old
--    one is left alone because other policies still depend on it.
-- 2. The single UPDATE policy becomes two: staff (unchanged behaviour) and clients (non-staff,
--    full-scope member of the request's tenant, with a WITH CHECK).
-- 3. A BEFORE UPDATE guard for non-staff callers: only received_document_id, received_at and
--    status may change; status may only become 'received' (from pending, rejected or
--    resubmit_requested); an accepted item is frozen; the attached document must belong to the
--    same tenant. The guard keys on auth.uid() / is_staff(), not the JWT role claim, and lets
--    trusted server paths (auth.uid() is null, e.g. service_role) through.
-- 4. anon loses UPDATE on the table (RLS already denied it; the grant was never needed).
--
-- Existing client uploads (useEvidenceRequests, useAuditPrep) already write exactly the allowed
-- columns, and staff review writes are unaffected.
-- Rollback: rollback/20261029120000_evidence_item_client_update_guard.down.sql

-- 1. Scope-aware tenant access ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_has_full_tenant_access(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = auth.uid()
      AND tu.access_scope = 'full'
  )
$$;

REVOKE ALL ON FUNCTION public.user_has_full_tenant_access(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_full_tenant_access(bigint) TO authenticated;

-- 2. Policies -------------------------------------------------------------------------

DROP POLICY IF EXISTS evidence_request_items_update ON public.evidence_request_items;

CREATE POLICY evidence_request_items_update_staff
  ON public.evidence_request_items FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY evidence_request_items_update_client
  ON public.evidence_request_items FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.evidence_requests r
      WHERE r.id = evidence_request_items.request_id
        AND public.user_has_full_tenant_access(r.tenant_id)
    )
  )
  WITH CHECK (
    NOT public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.evidence_requests r
      WHERE r.id = evidence_request_items.request_id
        AND public.user_has_full_tenant_access(r.tenant_id)
    )
  );

-- 3. Guard for non-staff callers --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_evidence_item_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- Trusted server paths have no end user; staff review through their own policy.
  IF auth.uid() IS NULL OR public.is_staff() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'An accepted evidence item cannot be changed by the client'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.item_name IS DISTINCT FROM OLD.item_name
     OR NEW.guidance_text IS DISTINCT FROM OLD.guidance_text
     OR NEW.accepted_file_types IS DISTINCT FROM OLD.accepted_file_types
     OR NEW.is_required IS DISTINCT FROM OLD.is_required
     OR NEW.display_order IS DISTINCT FROM OLD.display_order
     OR NEW.section_id IS DISTINCT FROM OLD.section_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the attached file can be changed on an evidence item'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status <> 'received'
          OR OLD.status NOT IN ('pending', 'rejected', 'resubmit_requested')) THEN
    RAISE EXCEPTION 'A client can only mark an evidence item as received'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.received_document_id IS DISTINCT FROM OLD.received_document_id
     AND (NEW.received_document_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.portal_documents d
            JOIN public.evidence_requests r ON r.id = NEW.request_id
            WHERE d.id = NEW.received_document_id
              AND d.tenant_id = r.tenant_id
          )) THEN
    RAISE EXCEPTION 'The attached document must belong to the same tenant'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_evidence_item_client_update ON public.evidence_request_items;
CREATE TRIGGER trg_enforce_evidence_item_client_update
  BEFORE UPDATE ON public.evidence_request_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_evidence_item_client_update();

-- 4. anon never needed UPDATE -----------------------------------------------------------

REVOKE UPDATE ON public.evidence_request_items FROM anon;

NOTIFY pgrst, 'reload schema';
