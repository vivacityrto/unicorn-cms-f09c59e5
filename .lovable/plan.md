

## Plan: Create `dd_stage_types` Lookup Table and Replace Hardcoded Arrays

### Seed Data (6 types, no "Other", no "Finalise")

| value | label | color | is_milestone | sort_order |
|---|---|---|---|---|
| onboarding | Onboarding | bg-blue-500/10 text-blue-600 border-blue-500/20 | **true** | 10 |
| delivery | Delivery | bg-emerald-500/10 text-emerald-600 border-emerald-500/20 | **true** | 20 |
| documentation | Documentation | bg-teal-500/10 text-teal-600 border-teal-500/20 | **true** | 30 |
| support | Ongoing Support | bg-purple-500/10 text-purple-600 border-purple-500/20 | **false** | 40 |
| monitoring | Monitoring | bg-amber-500/10 text-amber-600 border-amber-500/20 | **false** | 50 |
| offboarding | Offboarding | bg-cyan-500/10 text-cyan-600 border-cyan-500/20 | **false** | 60 |

Removed: "Other" and "Finalise". Kept "Offboarding" (you said remove finalise, not offboarding).

### Changes

**1. Migration** -- Create `dd_stage_types` table (`value` PK, `label`, `color`, `is_milestone` boolean, `sort_order`, `is_active`). Seed the 6 rows. RLS: read for authenticated, write via `code_table_operation`.

**2. New hook: `src/hooks/useStageTypeOptions.ts`**
- Fetches active `dd_stage_types` ordered by `sort_order`
- Exports `useStageTypeOptions()` → `{ stageTypes, loading }`
- Exports `getStageTypeColor()` and `getStageTypeLabel()` helpers

**3. Replace hardcoded arrays in 7 files:**
- `src/pages/StageBuilder.tsx` -- lines 26-35
- `src/pages/AdminManageStages.tsx` -- lines 91-101
- `src/pages/AdminStageDetail.tsx` -- lines 53-60
- `src/pages/AdminStageAnalytics.tsx` -- lines 23-30
- `src/components/package-builder/StageDetailPanel.tsx` -- lines 40-46
- `src/components/package-builder/StagePreviewDialog.tsx` -- lines 60-66
- `src/components/package-builder/StageLibraryDialog.tsx` -- lines 25-31

Each: import hook, remove hardcoded array, use `stageTypes` from hook.

**4. Progress logic** -- `src/hooks/useClientManagement.tsx`
- Replace hardcoded `NON_TRACKABLE_STAGE_TYPES` with dynamic check: fetch stage types, exclude those where `is_milestone === false`. Keep static fallback list updated to `['offboarding', 'monitor', 'monitoring']` (removing `'finalise'`).

**5. Monitor auto-default** -- `src/components/client/PackageStagesManager.tsx`
- Add `'monitoring'` alongside existing `'monitor'` check for auto-defaulting to status 6.

**6. Data cleanup (insert tool)** -- Update any existing stages with `stage_type = 'finalise'` to `'offboarding'` and `stage_type = 'other'` to a sensible default.

