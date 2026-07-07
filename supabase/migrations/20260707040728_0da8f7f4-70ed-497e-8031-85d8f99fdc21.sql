-- =====================================================================
-- PR-B: Bulk Generate Documents — job tables, RLS, grants
-- =====================================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.bulk_document_job_items;
--   DROP TABLE IF EXISTS public.bulk_document_jobs;
--   DROP FUNCTION IF EXISTS public.tg_bulk_document_set_updated_at();
-- =====================================================================

-- ---------- 1. bulk_document_jobs -----------------------------------
CREATE TABLE public.bulk_document_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by            uuid NOT NULL,
  scope                 text NOT NULL CHECK (scope IN ('all','selected')),
  tenant_ids            bigint[] NOT NULL DEFAULT '{}',
  package_ids           bigint[] NOT NULL DEFAULT '{}',
  stage_ids             bigint[] NOT NULL DEFAULT '{}',
  document_ids          bigint[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','paused','completed','cancelled','failed')),
  total_items           integer NOT NULL DEFAULT 0,
  generated_count       integer NOT NULL DEFAULT 0,
  skipped_count         integer NOT NULL DEFAULT 0,
  failed_count          integer NOT NULL DEFAULT 0,
  provisioning_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary         jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  finished_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bulk_document_jobs_status_idx
  ON public.bulk_document_jobs (status);
CREATE INDEX bulk_document_jobs_created_by_created_at_idx
  ON public.bulk_document_jobs (created_by, created_at DESC);

-- ---------- 2. bulk_document_job_items ------------------------------
CREATE TABLE public.bulk_document_job_items (
  id                    bigserial PRIMARY KEY,
  job_id                uuid NOT NULL
                          REFERENCES public.bulk_document_jobs(id) ON DELETE CASCADE,
  tenant_id             bigint NOT NULL
                          REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_instance_id   bigint NOT NULL
                          REFERENCES public.package_instances(id) ON DELETE CASCADE,
  stageinstance_id      bigint NOT NULL
                          REFERENCES public.stage_instances(id) ON DELETE CASCADE,
  document_id           bigint NOT NULL
                          REFERENCES public.documents(id) ON DELETE CASCADE,
  document_instance_id  bigint NOT NULL
                          REFERENCES public.document_instances(id) ON DELETE CASCADE,
  document_version_id   uuid,
  state                 text NOT NULL DEFAULT 'pending'
                          CHECK (state IN ('pending','leased','succeeded','skipped','failed','cancelled')),
  attempt_count         integer NOT NULL DEFAULT 0,
  leased_at             timestamptz,
  lease_expires_at      timestamptz,
  worker_id             text,
  last_error            text,
  last_error_code       text,
  outcome               jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  finished_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_document_job_items_unique_target
    UNIQUE (job_id, tenant_id, document_id, stageinstance_id)
);

CREATE INDEX bulk_document_job_items_job_state_idx
  ON public.bulk_document_job_items (job_id, state);
CREATE INDEX bulk_document_job_items_leased_partial_idx
  ON public.bulk_document_job_items (state, leased_at)
  WHERE state = 'leased';
CREATE INDEX bulk_document_job_items_tenant_idx
  ON public.bulk_document_job_items (tenant_id);

-- ---------- 3. updated_at trigger function --------------------------
CREATE OR REPLACE FUNCTION public.tg_bulk_document_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_bulk_document_set_updated_at() FROM PUBLIC;

CREATE TRIGGER bulk_document_jobs_set_updated_at
  BEFORE UPDATE ON public.bulk_document_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_bulk_document_set_updated_at();

CREATE TRIGGER bulk_document_job_items_set_updated_at
  BEFORE UPDATE ON public.bulk_document_job_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_bulk_document_set_updated_at();

-- ---------- 4. Grants ----------------------------------------------
GRANT SELECT ON public.bulk_document_jobs      TO authenticated;
GRANT ALL    ON public.bulk_document_jobs      TO service_role;
GRANT SELECT ON public.bulk_document_job_items TO authenticated;
GRANT ALL    ON public.bulk_document_job_items TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.bulk_document_job_items_id_seq TO service_role;

-- ---------- 5. RLS --------------------------------------------------
ALTER TABLE public.bulk_document_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_document_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulk_document_jobs_select
  ON public.bulk_document_jobs
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_vivacity_internal_safe(auth.uid())
  );

CREATE POLICY bulk_document_job_items_select
  ON public.bulk_document_job_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bulk_document_jobs j
      WHERE j.id = bulk_document_job_items.job_id
        AND (
          j.created_by = auth.uid()
          OR public.is_vivacity_internal_safe(auth.uid())
        )
    )
  );

-- ---------- 6. Schema reload ---------------------------------------
NOTIFY pgrst, 'reload schema';