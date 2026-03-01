
-- ============================================================
-- governance_document_deliveries
-- Tracks each governance document delivery to a tenant's
-- SharePoint folder. Idempotency: unique on
-- (tenant_id, document_version_id, snapshot_id).
-- ============================================================

CREATE TABLE public.governance_document_deliveries (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       bigint      NOT NULL REFERENCES public.tenants(id),
  document_id     bigint      NOT NULL REFERENCES public.documents(id),
  document_version_id uuid    NOT NULL REFERENCES public.document_versions(id),
  snapshot_id     uuid        REFERENCES public.tga_rto_snapshots(id),

  -- Delivery outcome
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'skipped')),
  error_message   text,

  -- SharePoint file reference
  sharepoint_item_id  text,
  sharepoint_web_url  text,
  delivered_file_name text,

  -- Category subfolder used
  category_subfolder  text,

  -- Audit
  delivered_by    uuid        NOT NULL,
  delivered_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotency constraint: one delivery per version per tenant per snapshot
CREATE UNIQUE INDEX uq_governance_delivery_idempotent
  ON public.governance_document_deliveries (tenant_id, document_version_id, snapshot_id)
  WHERE snapshot_id IS NOT NULL;

-- For deliveries without a snapshot (e.g., non-TGA documents)
CREATE UNIQUE INDEX uq_governance_delivery_no_snapshot
  ON public.governance_document_deliveries (tenant_id, document_version_id)
  WHERE snapshot_id IS NULL;

-- Performance indexes
CREATE INDEX idx_gov_delivery_tenant    ON public.governance_document_deliveries (tenant_id);
CREATE INDEX idx_gov_delivery_doc       ON public.governance_document_deliveries (document_id);
CREATE INDEX idx_gov_delivery_version   ON public.governance_document_deliveries (document_version_id);
CREATE INDEX idx_gov_delivery_status    ON public.governance_document_deliveries (status);

-- Enable RLS
ALTER TABLE public.governance_document_deliveries ENABLE ROW LEVEL SECURITY;

-- Vivacity staff can do everything (they initiate deliveries)
CREATE POLICY "Vivacity staff full access on governance deliveries"
  ON public.governance_document_deliveries
  FOR ALL
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Client admins can view deliveries for their tenant (read-only)
CREATE POLICY "Client users can view their tenant governance deliveries"
  ON public.governance_document_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = governance_document_deliveries.tenant_id
        AND tu.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_governance_document_deliveries_updated_at
  BEFORE UPDATE ON public.governance_document_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
