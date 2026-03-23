

# Duplicate Document Detection & Cleanup

## Problem
The `documents` table contains duplicate entries with the same or near-identical titles (e.g., 3x "Student Handbook", 7x "CEO Guide for STAT DEC"). Each duplicate spawns its own `document_instances`, `stage_documents`, etc., causing multiplication in the UI.

## Plan

### 1. Add "Duplicates" filter to Manage Documents page
Add a new filter option alongside the existing Category filter — a "Show Duplicates Only" toggle/badge button. When active, it filters the document list to only show titles that appear more than once (case-insensitive match).

- Compute duplicate title groups from the loaded `documents` array using a case-insensitive title frequency map
- Add a filter button (e.g., `<Badge>` styled toggle) next to the search bar: "Duplicates (N)" where N is the count of documents with duplicate titles
- When active, `applyFiltersAndSort` filters to only documents whose title appears 2+ times
- Sort duplicate groups together by title for easy comparison

### 2. Cascade-aware delete via a Supabase RPC
The current delete just does `supabase.from("documents").delete().eq("id", docId)` — this may fail or leave orphans depending on FK constraints. Create an RPC `delete_document_cascade` that:

1. Deletes from `document_instances` where `document_id = p_doc_id`
2. Deletes from `stage_documents` where `document_id = p_doc_id`
3. Deletes from `document_data_sources` where `document_id = p_doc_id` (has CASCADE but explicit is safer)
4. Deletes from `document_source_mappings` where `document_id = p_doc_id`
5. Deletes from `documents_tenants` where matching document
6. Deletes the `documents` row itself
7. Returns a summary of what was cleaned up

### 3. Update delete handlers to use cascade RPC
Replace both the single-delete and bulk-delete handlers to call the new RPC. Show the user a summary of what will be removed (instance count, stage links) in the confirmation dialog before proceeding.

### 4. Enhanced delete confirmation for duplicates
When deleting a document that has active `document_instances` or `stage_documents` links, the confirm dialog should show:
- Number of document instances that will be removed
- Number of stage template links that will be removed
- Use the existing `ConfirmDialog` component with `variant="destructive"`

## Files to Change

| File | Change |
|------|--------|
| `src/pages/ManageDocuments.tsx` | Add duplicate filter state, toggle button, filter logic, update delete to use RPC |
| New migration | Create `delete_document_cascade` RPC |

## Technical Notes
- Duplicate detection is client-side on the already-loaded documents array (no extra query needed)
- The RPC uses `SECURITY DEFINER` to ensure it can clean all related tables regardless of RLS
- Existing FK `ON DELETE CASCADE` on `document_data_sources` and `document_source_mappings` means those are auto-cleaned, but `document_instances` and `stage_documents` may not have cascades, so explicit deletes are needed

