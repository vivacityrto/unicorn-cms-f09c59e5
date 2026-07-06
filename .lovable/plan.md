## Objective
Fix the Training Products in Scope search on the New Audit modal so Units of Competency are no longer silently excluded.

## Root cause
In `src/components/audit/ScopeMultiSelect.tsx`, `GROUP_ORDER` is used to pre-filter scope items before the search filter runs. It currently contains `['qualification', 'skillset', 'accreditedCourse']`. Because `'unit'` is absent, every `scope_type === 'unit'` row is dropped in the `filtered` memo, so the Command list always shows "No matching products" for units even when the tenant has them on scope.

## Change (one file only)
File: `src/components/audit/ScopeMultiSelect.tsx`

1. **GROUP_LABELS** — add entry:
   ```ts
   unit: 'Units of Competency',
   ```

2. **GROUP_ORDER** — insert `'unit'` immediately after `'qualification'`:
   ```ts
   const GROUP_ORDER = ['qualification', 'unit', 'skillset', 'accreditedCourse'];
   ```

No other lines in this file or any other file will be modified.

## Verification
- Re-open the New Audit modal and focus the Training Products in Scope field.
- Type a unit code or title that exists on the tenant's scope.
- Confirm the matching unit appears in the dropdown and can be selected.