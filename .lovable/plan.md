

## Migrate Stage Registry to `stages` Table (No Column Renames)

### Context
The `stages` table is the active table used by the tenant-package-task system with columns: `name`, `shortname`, `videourl`, `dateimported`, `description`, `is_recurring`. The deprecated `documents_stages` table has 24+ columns with different naming conventions (`title`, `short_name`, `video_url`). We need to add the missing metadata columns to `stages` and switch all 27 `documents_stages` code references, remapping column names where they differ.

### Column Name Mapping
The code currently referencing `documents_stages` uses these column names. When switching to `stages`, every reference must be remapped:

| `documents_stages` (current code) | `stages` (actual column) |
|---|---|
| `title` | `name` |
| `short_name` | `shortname` |
| `video_url` | `videourl` |
| `created_at` | `dateimported` |

All other new columns will be added with matching names so no additional mapping is needed for those.

### Step 1: Database Migration -- Add Columns to `stages`

Add these columns to the existing `stages` table (no renames, no drops):

```text
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS stage_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS stage_type text DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_certified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certified_notes text,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS requires_stage_keys text[],
  ADD COLUMN IF NOT EXISTS frameworks text[],
  ADD COLUMN IF NOT EXISTS covers_standards text[],
  ADD COLUMN IF NOT EXISTS registry_code text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS deprecated_at timestamptz,
  ADD COLUMN IF NOT EXISTS dashboard_visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_reusable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_hint text;
```

### Step 2: Update Supabase Types
The auto-generated types file will reflect the new schema after migration. The `StageRegistry` type alias in `src/types/stage-registry.ts` will be updated to point to `stages` instead of `documents_stages`.

### Step 3: Global Code Refactor (27 files)

For each file currently using `.from('documents_stages')`, two changes are needed:

**A. Switch table reference:** `.from('documents_stages')` becomes `.from('stages')`

**B. Remap column names in all queries and field access:**
- `.select('...title...')` becomes `.select('...name...')`  
- `.select('...short_name...')` becomes `.select('...shortname...')`  
- `.select('...video_url...')` becomes `.select('...videourl...')`  
- `.select('...created_at...')` becomes `.select('...dateimported...')`  
- `.order('title')` becomes `.order('name')`  
- `.ilike('title', ...)` becomes `.ilike('name', ...)`  
- `.insert({ title: ... })` becomes `.insert({ name: ... })`  
- `.update({ title: ... })` becomes `.update({ name: ... })`  
- All property access like `stage.title` becomes `stage.name`, `stage.short_name` becomes `stage.shortname`, etc.

**C. Remove mapping shims:** The existing mapping code in `usePackageBuilder.tsx` (lines 472-491) that translates `stages` column names to `documents_stages` column names can be simplified since both paths will now use `stages` directly.

### Files to Update

**Hooks:**
- `src/hooks/usePackageBuilder.tsx` -- stage queries, inserts, updates, and the mapping shim
- `src/hooks/useStageDependencies.tsx` -- dependency queries and updates
- `src/hooks/useStageVersions.tsx` -- version management
- `src/hooks/useStageDuplication.tsx` -- stage duplication
- `src/hooks/useStageReplacement.tsx` -- stage replacement
- `src/hooks/useStageStandards.tsx` -- standards updates
- `src/hooks/useStageTemplateContent.tsx` -- template content queries
- `src/hooks/useStageExportImport.tsx` -- export/import (title->name in inserts/selects)
- `src/hooks/useStageCertification.tsx` -- certification RPC
- `src/hooks/useStageQualityCheck.tsx` -- quality checks
- `src/hooks/useStageAuditLog.tsx` -- audit queries
- `src/hooks/useStageActiveUsage.tsx` -- active usage tracking
- `src/hooks/useClientWorkboard.tsx` -- workboard stage queries
- `src/hooks/useClientPackageInstances.tsx` -- stage metadata fetch
- `src/hooks/useOperationsDashboard.tsx` -- if referencing documents_stages

**Pages:**
- `src/pages/ManageStages.tsx` -- stage list, create, update, delete
- `src/pages/AdminStageDetail.tsx` -- stage detail view
- `src/pages/AdminManageStages.tsx` -- admin stage list
- `src/pages/StageBuilder.tsx` -- stage creation
- `src/pages/DocumentDetail.tsx` -- stage selector
- `src/pages/CalendarTimeCapture.tsx` -- stage name lookup

**Components:**
- `src/components/AddStageDialog.tsx` -- create/update stages
- `src/components/stage/StageFrameworkSelector.tsx` -- framework updates
- `src/components/stage/StageQualityIndicator.tsx` -- quality checks
- `src/components/tenant/TenantProgressTable.tsx` -- progress display (already maps title/short_name)
- `src/components/workboard/ClientWorkboardTab.tsx` -- stage queries
- `src/components/package-builder/AddRecommendedStagesDialog.tsx` -- recommended stages

**Edge Functions:**
- `supabase/functions/vector-index-update/index.ts`
- `supabase/functions/export-compliance-pack/index.ts`
- `supabase/functions/_shared/ask-viv-fact-builder/record-links.ts`

### Step 4: Update Type Definitions
Update `src/types/stage-registry.ts` to reference `stages` table and adjust property names to match actual column names (`name` instead of `title`, etc.).

### Step 5: Update Documentation
Update `docs/stage-registry.md` to reference the `stages` table with correct column names.

### Important Notes
- Existing `stages` columns (`name`, `shortname`, `videourl`, `dateimported`, `is_recurring`) are **not touched**
- The `stage_instances` table already references `stages.id` -- no FK changes needed
- `documents_stages` table remains untouched and can be dropped later at your discretion
- After migration, `stage_key` values should be populated for existing stages (can be done via SQL update)
- The `TenantProgressTable` component already fetches `title` and `short_name` from `documents_stages` -- this will switch to `name` and `shortname` from `stages`

