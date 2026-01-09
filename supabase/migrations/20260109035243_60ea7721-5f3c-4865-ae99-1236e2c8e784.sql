-- TGA tenant-first hardening + orphan cleanup (2026-01-09)

-- 1) Backfill any missing tenant_id on tga_links using tenant_profile.rto_number
WITH ranked AS (
  SELECT
    tp.tenant_id,
    tp.rto_number,
    tp.updated_at,
    ROW_NUMBER() OVER (PARTITION BY tp.rto_number ORDER BY tp.updated_at DESC NULLS LAST) AS rn
  FROM public.tenant_profile tp
  WHERE tp.rto_number IS NOT NULL
)
UPDATE public.tga_links tl
SET tenant_id = r.tenant_id
FROM ranked r
WHERE tl.tenant_id IS NULL
  AND tl.rto_number = r.rto_number
  AND r.rn = 1;

-- 2) Ensure tga_links.tenant_id is NOT NULL (only after best-effort backfill)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tga_links' AND column_name='tenant_id'
  ) THEN
    -- remove rows that still couldn't be backfilled (cannot safely attach to a tenant)
    DELETE FROM public.tga_links WHERE tenant_id IS NULL;

    ALTER TABLE public.tga_links
      ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- 3) FK tga_links.tenant_id -> tenants(id) ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tga_links_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.tga_links
      ADD CONSTRAINT tga_links_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4) Unique (tenant_id, rto_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tga_links_tenant_id_rto_number_key'
       OR conname = 'tga_links_tenant_rto_unique'
  ) THEN
    ALTER TABLE public.tga_links
      ADD CONSTRAINT tga_links_tenant_id_rto_number_key UNIQUE (tenant_id, rto_number);
  END IF;
END $$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_tga_links_tenant_id ON public.tga_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tga_links_tenant_rto ON public.tga_links(tenant_id, rto_number);
CREATE INDEX IF NOT EXISTS idx_tga_links_rto_number ON public.tga_links(rto_number);

-- 6) Ensure only one link row exists for tenant 329 / rto 91020
-- keep the most recently updated row if duplicates exist
DELETE FROM public.tga_links a
USING public.tga_links b
WHERE a.tenant_id = 329 AND a.rto_number = '91020'
  AND b.tenant_id = 329 AND b.rto_number = '91020'
  AND a.updated_at < b.updated_at;

-- 7) Orphan cleanup after tenant deletions
-- tenant_profile
DELETE FROM public.tenant_profile tp
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenants t WHERE t.id = tp.tenant_id
);

-- tga_links
DELETE FROM public.tga_links tl
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenants t WHERE t.id = tl.tenant_id
);

-- tga debug payloads
DELETE FROM public.tga_debug_payloads dp
WHERE dp.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = dp.tenant_id
  );

-- tga tenant-scoped data tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tga_rto_summary',
    'tga_rto_contacts',
    'tga_rto_addresses',
    'tga_rto_delivery_locations',
    'tga_scope_qualifications',
    'tga_scope_skillsets',
    'tga_scope_units',
    'tga_scope_courses',
    'tga_rto_import_jobs',
    'tga_import_audit'
  ]
  LOOP
    EXECUTE format(
      'DELETE FROM public.%I x WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = x.tenant_id);',
      tbl
    );
  END LOOP;
END $$;