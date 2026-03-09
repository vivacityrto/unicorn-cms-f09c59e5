

## Migrate EOS Rock Status from Enum to dd_ Lookup Table

### Problem
The `eos_rocks.status` column uses a PostgreSQL enum type (`eos_rock_status`), which is rigid and inconsistent with the project's established pattern of using `dd_` lookup tables for status/priority/type values (e.g., `dd_action_status`, `dd_priority`, `dd_status`, `dd_stage_types`).

### Solution

#### 1. Create `dd_rock_status` lookup table
Standard columns matching the existing dd_ pattern:
- `code` (integer PK)
- `value` (text, unique) -- stored in eos_rocks.status
- `label` (text) -- display name
- `color` (text) -- Tailwind classes for UI
- `sort_order` (integer)
- `is_active` (boolean, default true)

Seed data (matching current enum values):

| code | value | label | color | sort_order |
|------|-------|-------|-------|------------|
| 0 | not_started | Not Started | text-gray-600 | 0 |
| 1 | on_track | On Track | text-green-600 | 1 |
| 2 | at_risk | At Risk | text-amber-600 | 2 |
| 3 | off_track | Off Track | text-red-600 | 3 |
| 4 | complete | Complete | text-blue-600 | 4 |

Values will be lowercase snake_case (matching other dd_ tables), not PascalCase.

#### 2. Database migration
1. Add a new `status_text` column (text) to `eos_rocks`
2. Copy existing enum values to `status_text`, converting PascalCase to snake_case
3. Drop the enum column and rename `status_text` to `status`
4. Set default to `'not_started'`
5. Add RLS to `dd_rock_status` (read for authenticated, write for SuperAdmin)

#### 3. Update database functions
These functions cast to `::eos_rock_status` and must be updated to use plain text:
- `upsert_rock_with_parenting` -- remove all `::eos_rock_status` casts, use lowercase values
- `cascade_rock_status_change` -- trigger references `status` column (no cast needed, works as-is)
- `cascade_seat_owner_to_rocks` -- uses enum values (disabled but should be updated)

#### 4. Create `useRockStatusOptions` hook
New file: `src/hooks/useRockStatusOptions.ts`
- Follows exact pattern of `useActionStatusOptions.ts`
- Module-level cache, fetches from `dd_rock_status`
- Exports `useRockStatusOptions()`, `getRockStatusLabel()`, `getRockStatusColor()`

#### 5. Update `src/utils/rockStatusUtils.ts`
- Remove hardcoded `DB_ROCK_STATUS` constants and `ROCK_STATUS_CONFIG`
- `getStatusOptions()` becomes a thin wrapper or is replaced by the hook
- `dbToUiStatus()` simplifies -- values are already lowercase, just passthrough
- `uiToDbStatus()` simplifies -- no more PascalCase conversion needed
- `getStatusConfig()` pulls from cached dd_ data or falls back to defaults

#### 6. Update consuming components (9 files)
All imports from `rockStatusUtils` continue to work since we keep the same export names. The key changes:
- `RockFormDialog.tsx` -- use hook for status dropdown options
- `RockProgressControl.tsx` -- use hook for status dropdown options
- `CreateCompanyRockDialog.tsx`, `CreateTeamRockDialog.tsx`, `CreateIndividualRockDialog.tsx` -- default status becomes `'not_started'` (lowercase)
- `RockCard.tsx`, `EosRocks.tsx`, `rockRollup.ts` -- work unchanged since `dbToUiStatus` still returns the same `UiRockStatus` type

### Files changed
- 1 new migration (create table, migrate column, update functions)
- 1 new hook (`src/hooks/useRockStatusOptions.ts`)
- 1 rewritten utility (`src/utils/rockStatusUtils.ts`)
- ~6 component files updated for lowercase default values and hook usage

