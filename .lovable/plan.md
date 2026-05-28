Replace the broken nested-join queryFn in `src/components/client/ClientGovernanceDocumentsPage.tsx` with flat sequential queries.

1. Replace `queryFn` (lines 77-145) with the new implementation:
   - Parallel fetch: `document_instances` (with only the `documents` nested join, no stage/package chain), `dd_document_categories`, `dd_governance_framework`.
   - Then resolve package names manually: collect distinct `stageinstance_id` → query `stage_instances` for `packageinstance_id` → query `package_instances` for `package_id` → query `packages` for `name`. Build a `packageNameByStageId` map.
   - Map rows using the package name map (`packageNameByStageId.get(r.stageinstance_id)`) instead of nested join traversal.
   - Keep the existing sort (category_sort, then title).

2. Bump `queryKey` from `"client-governance-documents-v2"` to `"client-governance-documents-v3"` to bust cache.

3. `handleDownload` already matches the requested implementation — no change needed.

4. `STORAGE_BUCKET` constant and `supabase.storage` calls — already absent. No change needed.

Out of scope: UI, filters, type shape, access guard, skeleton, empty states — all untouched.