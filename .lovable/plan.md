
# Migration Script: Phases 0, 1, 2 (Tenants Sync) - REVISED

## Overview

This first batch covers backup creation, FK constraint removal, unique index handling, and tenants ID synchronization.

---

## What This Script Does

| Phase | Action | Impact |
|-------|--------|--------|
| 0 | Create backup tables | 6 tables backed up |
| 1 | Drop all FK constraints | 136 constraints removed |
| 1b | Drop unique indexes with tenant_id | 7 indexes removed |
| 2 | Sync tenants IDs | 20 child tables updated, `id` becomes legacy ID |
| 2h | Restore unique indexes | 7 indexes recreated |

---

## Technical Section: Complete SQL Script

```text
-- ============================================
-- PHASES 0, 1, 2: BACKUP, DROP FKs, DROP UNIQUE INDEXES, SYNC TENANTS
-- ============================================

-- ============================================
-- PHASE 0: CREATE BACKUP TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS backup_tenants AS SELECT * FROM public.tenants;
CREATE TABLE IF NOT EXISTS backup_packages AS SELECT * FROM public.packages;
CREATE TABLE IF NOT EXISTS backup_package_instances AS SELECT * FROM public.package_instances;
CREATE TABLE IF NOT EXISTS backup_notes AS SELECT * FROM public.notes;
CREATE TABLE IF NOT EXISTS backup_tenant_addresses AS SELECT * FROM public.tenant_addresses;
CREATE TABLE IF NOT EXISTS backup_users AS SELECT * FROM public.users;

-- ============================================
-- PHASE 1: DROP ALL FK CONSTRAINTS
-- ============================================
DO $$
DECLARE
  r RECORD;
  drop_count INTEGER := 0;
BEGIN
  FOR r IN 
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint 
    WHERE contype = 'f' AND confrelid = 'public.tenants'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
    drop_count := drop_count + 1;
  END LOOP;
  
  FOR r IN 
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint 
    WHERE contype = 'f' AND confrelid = 'public.packages'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
    drop_count := drop_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Dropped % FK constraints', drop_count;
END $$;

-- ============================================
-- PHASE 1b: DROP UNIQUE INDEXES WITH TENANT_ID
-- ============================================
DROP INDEX IF EXISTS public.idx_tenant_addresses_unique_ho;
DROP INDEX IF EXISTS public.idx_tenant_addresses_unique_po;
DROP INDEX IF EXISTS public.tenant_rto_scope_unique_code;
DROP INDEX IF EXISTS public.membership_entitlements_tenant_id_package_id_key;
DROP INDEX IF EXISTS public.client_package_stage_state_tenant_id_package_id_stage_id_key;
DROP INDEX IF EXISTS public.tenant_stages_tenant_id_stage_id_package_id_key;

-- Drop tenant_profile primary key (it's tenant_id based)
ALTER TABLE public.tenant_profile DROP CONSTRAINT IF EXISTS tenant_profile_pkey;

-- ============================================
-- PHASE 2: SYNC TENANTS
-- ============================================

-- Step 2a: Delete tenants with NULL legacy_id
DELETE FROM public.tenants WHERE legacy_id IS NULL;

-- Step 2b: Drop primary key
ALTER TABLE public.tenants DROP CONSTRAINT tenants_pkey;

-- Step 2c: Rename id to import_id
ALTER TABLE public.tenants RENAME COLUMN id TO import_id;

-- Step 2d: Update all 20 child tables with data
UPDATE public.tenant_rto_scope c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_agenda_templates c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_addresses c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.users c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_profile c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_clients c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_meetings c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_agendas c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_compliance_settings c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_rocks c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_issues c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_todos c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.documents c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_headlines c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_meeting_items c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.membership_entitlements c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_vision c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.client_package_stage_state c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.package_workflow_logs c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_stages c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.notes c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;

-- Step 2e: Rename legacy_id to id
ALTER TABLE public.tenants RENAME COLUMN legacy_id TO id;

-- Step 2f: Restore primary key
ALTER TABLE public.tenants ADD PRIMARY KEY (id);

-- Step 2g: Reset sequence
SELECT setval('tenants_id_new_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tenants), false);

-- ============================================
-- PHASE 2h: RESTORE UNIQUE INDEXES
-- ============================================
CREATE UNIQUE INDEX idx_tenant_addresses_unique_ho ON public.tenant_addresses (tenant_id, address_type) WHERE (address_type = 'HO' AND (inactive IS NULL OR inactive = false));
CREATE UNIQUE INDEX idx_tenant_addresses_unique_po ON public.tenant_addresses (tenant_id, address_type) WHERE (address_type = 'PO' AND (inactive IS NULL OR inactive = false));
CREATE UNIQUE INDEX tenant_rto_scope_unique_code ON public.tenant_rto_scope (tenant_id, code, scope_type);
CREATE UNIQUE INDEX membership_entitlements_tenant_id_package_id_key ON public.membership_entitlements (tenant_id, package_id);
CREATE UNIQUE INDEX client_package_stage_state_tenant_id_package_id_stage_id_key ON public.client_package_stage_state (tenant_id, package_id, stage_id);
CREATE UNIQUE INDEX tenant_stages_tenant_id_stage_id_package_id_key ON public.tenant_stages (tenant_id, stage_id, package_id);

-- Restore tenant_profile primary key
ALTER TABLE public.tenant_profile ADD PRIMARY KEY (tenant_id);

-- ============================================
-- PHASE 2 VALIDATION
-- ============================================
DO $$
DECLARE
  tenant_count INTEGER;
  tenant_min_id BIGINT;
  tenant_max_id BIGINT;
  fk_remaining INTEGER;
BEGIN
  SELECT COUNT(*), MIN(id), MAX(id) INTO tenant_count, tenant_min_id, tenant_max_id FROM public.tenants;
  SELECT COUNT(*) INTO fk_remaining FROM pg_constraint WHERE contype = 'f' AND (confrelid = 'public.tenants'::regclass OR confrelid = 'public.packages'::regclass);
  
  RAISE NOTICE '=== PHASES 0-2 COMPLETE ===';
  RAISE NOTICE 'Tenants: % records (id range: % to %)', tenant_count, tenant_min_id, tenant_max_id;
  RAISE NOTICE 'FK constraints remaining: % (should be 0)', fk_remaining;
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining phases:';
  RAISE NOTICE '  Phase 3: Sync packages (rename id -> import_id, update 14 child tables)';
  RAISE NOTICE '  Phase 4: Sync package_instances (rename columns)';
  RAISE NOTICE '  Phase 5: Align notes.package_id by name matching';
  RAISE NOTICE '  Phase 6: Restore FK constraints (separate script)';
END $$;
```

---

## Expected Results After This Script

| Metric | Expected Value |
|--------|----------------|
| Tenants count | 399 (after deleting 6 with NULL legacy_id) |
| Tenants ID range | 5 to 7537 (legacy IDs) |
| FK constraints remaining | 0 |
| Backup tables created | 6 |

---

## Remaining Phases After Validation

| Phase | Description | Tables Affected |
|-------|-------------|-----------------|
| 3 | Sync packages | 14 child tables + packages |
| 4 | Sync package_instances | Column renames only |
| 5 | Align notes.package_id | Name-based matching |
| 6 | Restore FK constraints | 136+ constraints (separate script) |

After running this script, let me know the results and I will prepare Phase 3-5 for you.
