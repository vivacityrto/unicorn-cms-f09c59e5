
-- ============================================
-- PHASE 3: SYNC PACKAGES
-- ============================================

-- Step 3a: Create backup (already done in Phase 0, but verify)
CREATE TABLE IF NOT EXISTS backup_packages_phase3 AS SELECT * FROM public.packages;

-- Step 3b: Drop primary key
ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS packages_pkey;

-- Step 3c: Rename id to import_id
ALTER TABLE public.packages RENAME COLUMN id TO import_id;

-- Step 3d: Update all 8 child tables with data (package_id -> u1_packageid mapping)
UPDATE public.package_instances c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.documents c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.package_staff_tasks c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.package_client_tasks c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.membership_entitlements c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.client_package_stage_state c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.package_stages c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.package_stage_map c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;
UPDATE public.package_workflow_logs c SET package_id = t.u1_packageid FROM public.packages t WHERE c.package_id = t.import_id AND t.u1_packageid IS NOT NULL;

-- Step 3e: Rename u1_packageid to id
ALTER TABLE public.packages RENAME COLUMN u1_packageid TO id;

-- Step 3f: Delete packages with NULL id (no legacy mapping)
DELETE FROM public.packages WHERE id IS NULL;

-- Step 3g: Restore primary key
ALTER TABLE public.packages ADD PRIMARY KEY (id);

-- Step 3h: Reset sequence
SELECT setval('packages_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM public.packages), false);

-- ============================================
-- PHASE 3 VALIDATION
-- ============================================
DO $$
DECLARE
  pkg_count INTEGER;
  pkg_min_id BIGINT;
  pkg_max_id BIGINT;
  orphan_instances INTEGER;
BEGIN
  SELECT COUNT(*), MIN(id), MAX(id) INTO pkg_count, pkg_min_id, pkg_max_id FROM public.packages;
  SELECT COUNT(*) INTO orphan_instances FROM public.package_instances pi 
    WHERE NOT EXISTS (SELECT 1 FROM public.packages p WHERE p.id = pi.package_id);
  
  RAISE NOTICE '=== PHASE 3 COMPLETE ===';
  RAISE NOTICE 'Packages: % records (id range: % to %)', pkg_count, pkg_min_id, pkg_max_id;
  RAISE NOTICE 'Orphaned package_instances: % (should be 0)', orphan_instances;
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining phases:';
  RAISE NOTICE '  Phase 4: Sync package_instances (column renames)';
  RAISE NOTICE '  Phase 5: Align notes.package_id by name matching';
  RAISE NOTICE '  Phase 6: Restore FK constraints';
END $$;
