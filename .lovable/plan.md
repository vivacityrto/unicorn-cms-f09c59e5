

## Review and Fix Plan

### Issue 1: Documents Tab Error — `record "v_document" has no field "merge_fields"`

**Root Cause**: The `validate_document_readiness` RPC function (last updated in migration `20260107042638`) references `v_document.merge_fields` (line 39), but the `documents` table no longer has a `merge_fields` column. It has `detected_merge_fields` instead. The function is called by `DocumentReadinessBadge` (rendered in `StageDocumentsPanel.tsx`) whenever the Documents tab loads.

**Fix**: Create a new migration to update `validate_document_readiness` to use `document_fields` table (the new authoritative source for required merge fields) instead of the dropped `merge_fields` column. The function should query `document_fields` joined with `dd_fields` to get required fields, then validate them against `v_tenant_merge_fields`.

### Issue 2: Risk Level Change Note Dialog Never Opens

**Root Cause**: When risk level changes in `ClientDetail.tsx`, it sets `setActiveTab('notes')` and puts `initNote=true` and `noteTitle` into URL search params. However, `ClientStructuredNotesTab` (the component rendered for the notes tab) does NOT read these URL params. Only `TenantNotes.tsx` (at route `/tenant/:id/notes`) has that logic. So the tab switches but no note dialog opens.

**Fix**: Add `initNote`/`noteTitle` param reading to `ClientStructuredNotesTab`. When `initNote=true` is detected in search params:
1. Auto-open the note creation dialog
2. Pre-fill the title with the `noteTitle` param
3. Pre-select note type as "risk"
4. Clean up the URL params after opening

### Implementation Steps

1. **Migration: Fix `validate_document_readiness`**
   - Replace `v_document.merge_fields` reference with a query to `document_fields` + `dd_fields` tables
   - Keep the same function signature (backward-compatible)
   - If no `document_fields` rows exist for the document, set merge_status to 'pass' (no requirements defined)

2. **Update `ClientStructuredNotesTab.tsx`**
   - Import `useSearchParams` from react-router-dom
   - Add a `useEffect` that checks for `initNote=true` in search params
   - When detected, auto-open the note form dialog with pre-filled title and "risk" note type
   - Clear the params after consuming them

3. **No changes needed** to `RiskLevelBadge.tsx` or `ClientDetail.tsx` — the param-setting logic is correct, just the consumer was missing.

### Files to Change

| File | Change |
|------|--------|
| New migration SQL | Fix `validate_document_readiness` to stop referencing `merge_fields` |
| `src/components/client/ClientStructuredNotesTab.tsx` | Read `initNote`/`noteTitle` from URL params, auto-open note dialog |

### Risks and Mitigations

- The `validate_document_readiness` fix is backward-compatible — same function signature, same return shape
- `ClientStructuredNotesTab` change is additive — only adds new behaviour when URL params are present
- No RLS, foreign key, or schema changes required

