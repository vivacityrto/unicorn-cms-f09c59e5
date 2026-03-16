

## Plan: Create Dropdown Tables for `package_type` and `progress_mode`

### Current State

**`package_type`** unique values: `audit`, `membership`, `project`, `regulatory_submission`
**`progress_mode`** unique values: `entitlement_milestone`, `milestone_based`, `phase_based`, `stage_completion`, `stage_complettion` (typo — should be fixed to `stage_completion`)

### Data Issue
There's a duplicate typo `stage_complettion` that should be corrected to `stage_completion` in the packages table.

### Database Changes (Migration)

1. **Create `dd_package_type`** table with standard dd_ structure (`id` serial, `code`, `label`, `description`, `sort_order`, `is_active`) and seed with the 4 existing values.

2. **Create `dd_progress_mode`** table with same structure, seed with the 4 unique values (deduped).

3. **Fix typo** — update any `packages` rows where `progress_mode = 'stage_complettion'` to `'stage_completion'`.

4. **Enable RLS** on both tables with read access for authenticated users and manage access for super admins / vivacity team.

### Code Changes

Update components that use hardcoded package_type/progress_mode values to use the new dropdown tables:

- **`CreatePackageDialog.tsx`** — replace hardcoded Select options with data from `dd_package_type`
- **`EditPackageDialog.tsx`** — same for edit form
- **`PackageBuilderOverview.tsx`** — replace `PACKAGE_TYPE_LABELS` / `PACKAGE_TYPE_ICONS` with dynamic data (keep icons mapped by code)
- **`useSuggestDropdowns.ts`** or a new hook — add queries for the two new tables so they're available app-wide

### No Breaking Changes
The `code` values in the new tables will match existing data in `packages`, so no foreign key is needed immediately — this keeps it consistent with the existing dd_ pattern used elsewhere.

