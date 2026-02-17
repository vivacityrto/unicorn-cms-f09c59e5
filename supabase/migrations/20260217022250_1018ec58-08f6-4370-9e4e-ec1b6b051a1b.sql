
-- ============================================================
-- Phase 1: Schema Upgrade (Non-breaking)
-- ============================================================
ALTER TABLE public.consult_logs
  ADD COLUMN IF NOT EXISTS tenant_id bigint NULL,
  ADD COLUMN IF NOT EXISTS consultant_user_uuid uuid NULL;

CREATE INDEX IF NOT EXISTS idx_consult_logs_client_id
  ON public.consult_logs (client_id);

CREATE INDEX IF NOT EXISTS idx_consult_logs_tenant_created_at
  ON public.consult_logs (tenant_id, created_at DESC);

-- ============================================================
-- Phase 2: Backfill tenant_id via bridge (no-op if 0 rows)
-- ============================================================
UPDATE public.consult_logs cl
SET tenant_id = v.tenant_id
FROM public.v_client_to_tenant v
WHERE cl.tenant_id IS NULL
  AND cl.client_id IS NOT NULL
  AND v.client_id = cl.client_id;

-- ============================================================
-- Phase 3: Strict Enforcement
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consult_logs_unmapped_quarantine (
  LIKE public.consult_logs INCLUDING ALL
);

INSERT INTO public.consult_logs_unmapped_quarantine
SELECT cl.*
FROM public.consult_logs cl
WHERE cl.tenant_id IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM public.consult_logs
WHERE tenant_id IS NULL;

-- ============================================================
-- Phase 4: Enforce FK + NOT NULL
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consult_logs_tenant_fk'
  ) THEN
    ALTER TABLE public.consult_logs
      ADD CONSTRAINT consult_logs_tenant_fk
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END$$;

ALTER TABLE public.consult_logs
  ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================
-- Phase 5: Replace v_tenant_last_activity (CASCADE to drop dependent views)
-- ============================================================
DROP VIEW IF EXISTS public.v_tenant_last_activity CASCADE;

CREATE OR REPLACE VIEW public.v_tenant_last_activity
WITH (security_invoker = true)
AS
SELECT
  t.id AS tenant_id,
  GREATEST(
    COALESCE((SELECT max(di.updated_at) FROM public.document_instances di WHERE di.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(n.updated_at) FROM public.notes n WHERE n.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(m.updated_at) FROM public.meetings m WHERE m.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(em.created_at) FROM public.email_messages em WHERE em.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(cl.created_at) FROM public.consult_logs cl WHERE cl.tenant_id = t.id), 'epoch'::timestamptz),
    COALESCE(t.created_at, 'epoch'::timestamptz)
  ) AS last_activity_at
FROM public.tenants t;

-- Recreate the dependent summary view
CREATE OR REPLACE VIEW public.v_tenant_activity_summary
WITH (security_invoker = true)
AS
SELECT
  count(*) AS tenants,
  min(last_activity_at) AS oldest_activity_at,
  max(last_activity_at) AS newest_activity_at,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY last_activity_at) AS median_activity_at
FROM public.v_tenant_last_activity;

-- ============================================================
-- Phase 6: Apply RLS to consult_logs
-- ============================================================
ALTER TABLE public.consult_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY consult_logs_staff_select
  ON public.consult_logs FOR SELECT TO authenticated
  USING (
    public.is_vivacity_staff(auth.uid())
    AND public.can_access_tenant(auth.uid(), tenant_id)
  );

CREATE POLICY consult_logs_staff_insert
  ON public.consult_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_vivacity_staff(auth.uid())
    AND public.can_access_tenant(auth.uid(), tenant_id)
  );

CREATE POLICY consult_logs_staff_update
  ON public.consult_logs FOR UPDATE TO authenticated
  USING (
    public.is_vivacity_staff(auth.uid())
    AND public.can_access_tenant(auth.uid(), tenant_id)
  )
  WITH CHECK (
    public.is_vivacity_staff(auth.uid())
    AND public.can_access_tenant(auth.uid(), tenant_id)
  );
