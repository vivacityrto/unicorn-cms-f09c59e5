-- ============================================
-- PHASES 0, 1, 2: BACKUP, DROP FKs, DROP CONSTRAINTS, DISABLE TRIGGERS, SYNC TENANTS
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
-- PHASE 1b: DROP UNIQUE CONSTRAINTS AND INDEXES
-- ============================================
ALTER TABLE public.tenant_rto_scope DROP CONSTRAINT IF EXISTS tenant_rto_scope_unique_code;
ALTER TABLE public.membership_entitlements DROP CONSTRAINT IF EXISTS membership_entitlements_tenant_id_package_id_key;
ALTER TABLE public.client_package_stage_state DROP CONSTRAINT IF EXISTS client_package_stage_state_tenant_id_package_id_stage_id_key;
ALTER TABLE public.tenant_stages DROP CONSTRAINT IF EXISTS tenant_stages_tenant_id_stage_id_package_id_key;
DROP INDEX IF EXISTS public.idx_tenant_addresses_unique_ho;
DROP INDEX IF EXISTS public.idx_tenant_addresses_unique_po;
ALTER TABLE public.tenant_profile DROP CONSTRAINT IF EXISTS tenant_profile_pkey;

-- ============================================
-- PHASE 1c: DISABLE TRIGGERS ON USERS TABLE
-- ============================================
ALTER TABLE public.users DISABLE TRIGGER trigger_update_tenant_status;
ALTER TABLE public.users DISABLE TRIGGER update_tenant_status_trigger;

-- ============================================
-- PHASE 2: SYNC TENANTS
-- ============================================

-- Step 2a: Delete tenants with NULL legacy_id
DELETE FROM public.tenants WHERE legacy_id IS NULL;

-- Step 2b: Drop primary key
ALTER TABLE public.tenants DROP CONSTRAINT tenants_pkey;

-- Step 2c: Rename id to import_id
ALTER TABLE public.tenants RENAME COLUMN id TO import_id;

-- Step 2d: Update child tables that actually have data (verified to exist)
UPDATE public.tenant_rto_scope c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_agenda_templates c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_addresses c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.users c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_profile c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_meetings c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.documents c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.notes c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.membership_entitlements c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.client_package_stage_state c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.package_workflow_logs c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.tenant_stages c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_rocks c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_issues c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;
UPDATE public.eos_todos c SET tenant_id = t.legacy_id FROM public.tenants t WHERE c.tenant_id = t.import_id;

-- Step 2e: Rename legacy_id to id
ALTER TABLE public.tenants RENAME COLUMN legacy_id TO id;

-- Step 2f: Restore primary key
ALTER TABLE public.tenants ADD PRIMARY KEY (id);

-- Step 2g: Reset sequence
SELECT setval('tenants_id_new_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM public.tenants), false);

-- ============================================
-- PHASE 2h: RESTORE UNIQUE CONSTRAINTS AND INDEXES
-- ============================================
ALTER TABLE public.tenant_rto_scope ADD CONSTRAINT tenant_rto_scope_unique_code UNIQUE (tenant_id, code, scope_type);
ALTER TABLE public.membership_entitlements ADD CONSTRAINT membership_entitlements_tenant_id_package_id_key UNIQUE (tenant_id, package_id);
ALTER TABLE public.client_package_stage_state ADD CONSTRAINT client_package_stage_state_tenant_id_package_id_stage_id_key UNIQUE (tenant_id, package_id, stage_id);
ALTER TABLE public.tenant_stages ADD CONSTRAINT tenant_stages_tenant_id_stage_id_package_id_key UNIQUE (tenant_id, stage_id, package_id);
CREATE UNIQUE INDEX idx_tenant_addresses_unique_ho ON public.tenant_addresses (tenant_id, address_type) WHERE (address_type = 'HO' AND (inactive IS NULL OR inactive = false));
CREATE UNIQUE INDEX idx_tenant_addresses_unique_po ON public.tenant_addresses (tenant_id, address_type) WHERE (address_type = 'PO' AND (inactive IS NULL OR inactive = false));
ALTER TABLE public.tenant_profile ADD PRIMARY KEY (tenant_id);

-- ============================================
-- PHASE 2i: RE-ENABLE TRIGGERS
-- ============================================
ALTER TABLE public.users ENABLE TRIGGER trigger_update_tenant_status;
ALTER TABLE public.users ENABLE TRIGGER update_tenant_status_trigger;