-- ============================================
-- COMPLETE LEGACY ID SYNC WITH PRESERVED COLUMNS
-- Uses OVERRIDING SYSTEM VALUE for identity columns
-- ============================================

-- Step 1: Create temp table with current public.packages data
CREATE TEMP TABLE tmp_packages AS
SELECT * FROM public.packages;

-- Step 2: Truncate dependent tables first
TRUNCATE TABLE public.package_instances CASCADE;
TRUNCATE TABLE public.packages CASCADE;

-- Step 3: Re-insert packages using u1_packageid as the new id
-- Using OVERRIDING SYSTEM VALUE to bypass GENERATED ALWAYS
INSERT INTO public.packages (
  id,
  name,
  status,
  slug,
  details,
  full_text,
  duration_months,
  total_hours,
  package_type,
  progress_mode,
  created_at,
  document_assurance_period,
  u1_packageid
)
OVERRIDING SYSTEM VALUE
SELECT 
  t.u1_packageid,           -- Use legacy ID as the new primary key
  t.name,
  t.status,
  t.slug,
  t.details,
  t.full_text,
  t.duration_months,
  t.total_hours,
  t.package_type,
  t.progress_mode,
  t.created_at,
  t.document_assurance_period,
  t.u1_packageid            -- Keep reference
FROM tmp_packages t
WHERE t.u1_packageid IS NOT NULL;

-- Step 4: Reset packages sequence
SELECT setval('public.packages_id_seq', 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.packages), false);

-- Step 5: Re-insert package_instances from unicorn1 with tenant mapping
-- Using OVERRIDING SYSTEM VALUE for identity column
INSERT INTO public.package_instances (
  id,
  package_id,
  tenant_id,
  client_id,
  start_date,
  end_date,
  is_complete,
  last_document_update_email,
  release_documents_pdf,
  release_documents_office,
  clo_id,
  u1_packageid
)
OVERRIDING SYSTEM VALUE
SELECT 
  pi.id,
  pi.package_id,
  ten.id AS tenant_id,
  ten.id AS client_id,
  pi.startdate,
  pi.enddate,
  pi.iscomplete,
  pi.lastdocumentupdateemail,
  pi.releasedocumentspdf,
  pi.releasedocumentsoffice,
  pi.clo_id,
  pi.package_id             -- Store legacy package_id reference
FROM unicorn1.package_instances pi
LEFT JOIN public.tenants ten ON ten.legacy_id = pi.client_id
WHERE ten.id IS NOT NULL;

-- Step 6: Reset package_instances sequence
SELECT setval('public.package_instances_id_seq', 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.package_instances), false);

-- Step 7: Update notes.package_id using name-based matching
UPDATE public.notes n
SET package_id = p.id
FROM public.packages p
WHERE LOWER(TRIM(n.u1_package)) = LOWER(TRIM(p.name))
  AND n.u1_package IS NOT NULL;

-- Step 8: Drop temp table
DROP TABLE tmp_packages;

-- Verification
DO $$
DECLARE
  pkg_count INTEGER;
  pkg_max_id INTEGER;
  pi_count INTEGER;
  pi_max_id INTEGER;
  notes_linked INTEGER;
  notes_orphaned INTEGER;
BEGIN
  SELECT COUNT(*), MAX(id) INTO pkg_count, pkg_max_id FROM public.packages;
  SELECT COUNT(*), MAX(id) INTO pi_count, pi_max_id FROM public.package_instances;
  SELECT 
    COUNT(*) FILTER (WHERE package_id IS NOT NULL),
    COUNT(*) FILTER (WHERE u1_package IS NOT NULL AND package_id IS NULL)
  INTO notes_linked, notes_orphaned
  FROM public.notes;
  
  RAISE NOTICE '=== SYNC COMPLETE ===';
  RAISE NOTICE 'Packages: % (max_id: %)', pkg_count, pkg_max_id;
  RAISE NOTICE 'Package Instances: % (max_id: %)', pi_count, pi_max_id;
  RAISE NOTICE 'Notes linked: %, Orphaned: %', notes_linked, notes_orphaned;
END $$;