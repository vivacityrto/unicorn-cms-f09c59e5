
# Reset packages and package_instances to Original unicorn1 IDs

## Objective
Update `public.packages` IDs to match original `unicorn1` IDs, update all FK references across 39 dependent tables, then re-import `package_instances` with direct ID mapping.

---

## Current State

| Table | ID Type | ID Generation | Records | Issue |
|-------|---------|---------------|---------|-------|
| packages | bigint | GENERATED ALWAYS | 32 | Uses auto-generated IDs, requires u1_packageid mapping |
| package_instances | bigint | BY DEFAULT | 1,003 | package_id references wrong IDs |

---

## Target State

| Table | ID Type | ID Generation | Records |
|-------|---------|---------------|---------|
| packages | bigint | BY DEFAULT | 32 (using original IDs: 1, 3, 5...1046) |
| package_instances | bigint | BY DEFAULT | 1,003 (using original IDs, package_id matches directly) |

---

## Revised Migration Strategy (FK-Safe)

### Phase 1: Create ID mapping and update all FK references

```sql
-- Step 1: Create temporary mapping table (old_id -> new_id from unicorn1)
CREATE TEMP TABLE pkg_id_map AS
SELECT 
  p.id AS old_id, 
  u1.id AS new_id
FROM public.packages p
JOIN unicorn1.packages u1 ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name));

-- Step 2: Temporarily disable FK constraints by dropping them
-- (We'll recreate them after)

-- Drop all FK constraints referencing packages.id
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_package_id_fkey;
ALTER TABLE public.tasks_tenants DROP CONSTRAINT IF EXISTS tasks_tenants_package_id_fkey;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_package_id_fkey;
ALTER TABLE public.package_staff_tasks DROP CONSTRAINT IF EXISTS fk_package_staff_tasks_package;
ALTER TABLE public.package_client_tasks DROP CONSTRAINT IF EXISTS fk_package_client_tasks_package;
ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_package_id_fkey;
ALTER TABLE public.package_workflow_logs DROP CONSTRAINT IF EXISTS package_workflow_logs_package_id_fkey;
ALTER TABLE public.tenant_notes DROP CONSTRAINT IF EXISTS tenant_notes_package_id_fkey;
ALTER TABLE public.tenant_stages DROP CONSTRAINT IF EXISTS tenant_stages_package_id_fkey;
ALTER TABLE public.documents_notes DROP CONSTRAINT IF EXISTS documents_notes_package_id_fkey;
ALTER TABLE public.membership_entitlements DROP CONSTRAINT IF EXISTS membership_entitlements_package_id_fkey;
ALTER TABLE public.membership_activity DROP CONSTRAINT IF EXISTS membership_activity_package_id_fkey;
ALTER TABLE public.membership_tasks DROP CONSTRAINT IF EXISTS membership_tasks_package_id_fkey;
ALTER TABLE public.membership_ai_suggestions DROP CONSTRAINT IF EXISTS membership_ai_suggestions_package_id_fkey;
ALTER TABLE public.membership_notes DROP CONSTRAINT IF EXISTS membership_notes_package_id_fkey;
ALTER TABLE public.package_stage_map DROP CONSTRAINT IF EXISTS package_stage_map_package_id_fkey;
ALTER TABLE public.client_package_stage_state DROP CONSTRAINT IF EXISTS client_package_stage_state_package_id_fkey;
ALTER TABLE public.package_stages DROP CONSTRAINT IF EXISTS package_stages_package_id_fkey;
ALTER TABLE public.package_stage_emails DROP CONSTRAINT IF EXISTS package_stage_emails_package_id_fkey;
ALTER TABLE public.package_builder_audit_log DROP CONSTRAINT IF EXISTS package_builder_audit_log_package_id_fkey;
ALTER TABLE public.package_stage_documents DROP CONSTRAINT IF EXISTS package_stage_documents_package_id_fkey;
ALTER TABLE public.generated_documents DROP CONSTRAINT IF EXISTS generated_documents_package_id_fkey;
ALTER TABLE public.client_packages DROP CONSTRAINT IF EXISTS client_packages_package_id_fkey;
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_package_id_fkey;
ALTER TABLE public.tenant_document_releases DROP CONSTRAINT IF EXISTS tenant_document_releases_package_id_fkey;
ALTER TABLE public.stage_releases DROP CONSTRAINT IF EXISTS stage_releases_package_id_fkey;
ALTER TABLE public.compliance_pack_exports DROP CONSTRAINT IF EXISTS compliance_pack_exports_package_id_fkey;
ALTER TABLE public.excel_generated_files DROP CONSTRAINT IF EXISTS excel_generated_files_package_id_fkey;
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_package_id_fkey;
ALTER TABLE public.active_timers DROP CONSTRAINT IF EXISTS active_timers_package_id_fkey;
ALTER TABLE public.client_alerts DROP CONSTRAINT IF EXISTS client_alerts_package_id_fkey;
ALTER TABLE public.calendar_time_drafts DROP CONSTRAINT IF EXISTS calendar_time_drafts_package_id_fkey;
ALTER TABLE public.calendar_time_drafts DROP CONSTRAINT IF EXISTS calendar_time_drafts_suggested_package_id_fkey;
ALTER TABLE public.document_activity_log DROP CONSTRAINT IF EXISTS document_activity_log_package_id_fkey;
ALTER TABLE public.client_action_items DROP CONSTRAINT IF EXISTS fk_client_action_items_package;
ALTER TABLE public.processes DROP CONSTRAINT IF EXISTS processes_applies_to_package_id_fkey;
ALTER TABLE public.process_versions DROP CONSTRAINT IF EXISTS process_versions_applies_to_package_id_fkey;
ALTER TABLE public.package_instances DROP CONSTRAINT IF EXISTS package_instances_package_id_fkey;
```

### Phase 2: Update package_id in all referencing tables

```sql
-- Update all tables that reference packages.id
UPDATE public.tenants t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.tasks_tenants t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.documents t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_staff_tasks t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_client_tasks t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.emails t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_workflow_logs t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.tenant_notes t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.tenant_stages t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.documents_notes t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.membership_entitlements t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.membership_activity t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.membership_tasks t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.membership_ai_suggestions t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.membership_notes t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_stage_map t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.client_package_stage_state t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_stages t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_stage_emails t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_builder_audit_log t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.package_stage_documents t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.generated_documents t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.client_packages t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.email_send_log t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.tenant_document_releases t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.stage_releases t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.compliance_pack_exports t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.excel_generated_files t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.time_entries t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.active_timers t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.client_alerts t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.calendar_time_drafts t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.calendar_time_drafts t SET suggested_package_id = m.new_id FROM pkg_id_map m WHERE t.suggested_package_id = m.old_id;
UPDATE public.document_activity_log t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.client_action_items t SET package_id = m.new_id FROM pkg_id_map m WHERE t.package_id = m.old_id;
UPDATE public.processes t SET applies_to_package_id = m.new_id FROM pkg_id_map m WHERE t.applies_to_package_id = m.old_id;
UPDATE public.process_versions t SET applies_to_package_id = m.new_id FROM pkg_id_map m WHERE t.applies_to_package_id = m.old_id;
```

### Phase 3: Update packages table IDs

```sql
-- Update packages.id to use original unicorn1 IDs
UPDATE public.packages p 
SET id = m.new_id 
FROM pkg_id_map m 
WHERE p.id = m.old_id;

-- Change id column from GENERATED ALWAYS to GENERATED BY DEFAULT
ALTER TABLE public.packages 
  ALTER COLUMN id DROP IDENTITY IF EXISTS,
  ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;

-- Reset sequence to max + 1
SELECT setval(pg_get_serial_sequence('public.packages', 'id'), 
  (SELECT MAX(id) FROM public.packages));

-- Drop the now-redundant u1_packageid column
ALTER TABLE public.packages DROP COLUMN IF EXISTS u1_packageid;
```

### Phase 4: Recreate FK constraints

```sql
-- Recreate all FK constraints
ALTER TABLE public.tenants ADD CONSTRAINT tenants_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.tasks_tenants ADD CONSTRAINT tasks_tenants_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.documents ADD CONSTRAINT documents_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_staff_tasks ADD CONSTRAINT fk_package_staff_tasks_package 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_client_tasks ADD CONSTRAINT fk_package_client_tasks_package 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.emails ADD CONSTRAINT emails_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_workflow_logs ADD CONSTRAINT package_workflow_logs_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.tenant_notes ADD CONSTRAINT tenant_notes_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.tenant_stages ADD CONSTRAINT tenant_stages_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.documents_notes ADD CONSTRAINT documents_notes_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.membership_entitlements ADD CONSTRAINT membership_entitlements_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.membership_activity ADD CONSTRAINT membership_activity_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.membership_tasks ADD CONSTRAINT membership_tasks_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.membership_ai_suggestions ADD CONSTRAINT membership_ai_suggestions_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.membership_notes ADD CONSTRAINT membership_notes_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_stage_map ADD CONSTRAINT package_stage_map_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.client_package_stage_state ADD CONSTRAINT client_package_stage_state_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_stages ADD CONSTRAINT package_stages_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_stage_emails ADD CONSTRAINT package_stage_emails_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_builder_audit_log ADD CONSTRAINT package_builder_audit_log_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_stage_documents ADD CONSTRAINT package_stage_documents_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.generated_documents ADD CONSTRAINT generated_documents_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.client_packages ADD CONSTRAINT client_packages_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.tenant_document_releases ADD CONSTRAINT tenant_document_releases_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.stage_releases ADD CONSTRAINT stage_releases_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.compliance_pack_exports ADD CONSTRAINT compliance_pack_exports_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.excel_generated_files ADD CONSTRAINT excel_generated_files_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.active_timers ADD CONSTRAINT active_timers_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.client_alerts ADD CONSTRAINT client_alerts_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.calendar_time_drafts ADD CONSTRAINT calendar_time_drafts_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.calendar_time_drafts ADD CONSTRAINT calendar_time_drafts_suggested_package_id_fkey 
  FOREIGN KEY (suggested_package_id) REFERENCES public.packages(id);
ALTER TABLE public.document_activity_log ADD CONSTRAINT document_activity_log_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.client_action_items ADD CONSTRAINT fk_client_action_items_package 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
ALTER TABLE public.processes ADD CONSTRAINT processes_applies_to_package_id_fkey 
  FOREIGN KEY (applies_to_package_id) REFERENCES public.packages(id);
ALTER TABLE public.process_versions ADD CONSTRAINT process_versions_applies_to_package_id_fkey 
  FOREIGN KEY (applies_to_package_id) REFERENCES public.packages(id);
ALTER TABLE public.package_instances ADD CONSTRAINT package_instances_package_id_fkey 
  FOREIGN KEY (package_id) REFERENCES public.packages(id);
```

### Phase 5: Truncate and re-insert package_instances

```sql
-- Clear existing data
TRUNCATE TABLE public.package_instances;

-- Re-insert from unicorn1 with direct package_id mapping
INSERT INTO public.package_instances (
  id,
  is_complete,
  start_date,
  end_date,
  package_id,
  client_id,
  last_document_update_email,
  release_documents_pdf,
  release_documents_office,
  clo_id,
  tenant_id
)
SELECT 
  u1.id,
  u1.iscomplete,
  u1.startdate,
  u1.enddate,
  u1.package_id,  -- Direct reference, no mapping needed!
  u1.client_id,
  u1.lastdocumentupdateemail,
  u1.releasedocumentspdf,
  u1.releasedocumentsoffice,
  u1.clo_id,
  t.id  -- Derive tenant_id from tenants.legacy_id
FROM unicorn1.package_instances u1
LEFT JOIN public.tenants t ON u1.client_id = t.legacy_id;

-- Reset sequence
SELECT setval(pg_get_serial_sequence('public.package_instances', 'id'), 
  (SELECT MAX(id) FROM public.package_instances));

-- Drop redundant column
ALTER TABLE public.package_instances DROP COLUMN IF EXISTS u1_packageid;
```

---

## Verification Queries

```sql
-- Verify package count
SELECT COUNT(*) FROM public.packages;
-- Expected: 32

-- Verify package_instances count
SELECT COUNT(*) FROM public.package_instances;
-- Expected: 1,003

-- Verify no orphaned instances
SELECT COUNT(*) 
FROM public.package_instances pi
LEFT JOIN public.packages p ON pi.package_id = p.id
WHERE p.id IS NULL;
-- Expected: 0

-- Verify ID matching with unicorn1
SELECT 
  p.id as public_id,
  u1.id as unicorn1_id,
  p.name
FROM public.packages p
JOIN unicorn1.packages u1 ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
WHERE p.id != u1.id;
-- Expected: 0 rows (all IDs should match)
```

---

## Impact Summary

| Metric | Value |
|--------|-------|
| Tables affected | 40 (packages + 39 referencing tables) |
| FK constraints dropped | 39 |
| FK constraints recreated | 39 |
| packages rows updated | 32 |
| package_instances rows | TRUNCATE + INSERT 1,003 |
| Columns removed | u1_packageid (from both tables) |
| Risk level | Medium (FK manipulation required) |

---

## Benefits

1. **Direct ID matching** - No more mapping confusion
2. **Simpler debugging** - unicorn1 ID = public ID
3. **Consistent pattern** - Same approach for stages, documents, etc.
4. **Cleaner schema** - No redundant u1_packageid columns
5. **FK integrity preserved** - All relationships maintained
