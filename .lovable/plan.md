## Goal

Make eight read-only document-fetch/count queries union-aware with `document_stage_links`, so shared documents (e.g. the 37 docs linked between stages 1114/1125) surface everywhere they should — not just under their primary stage. No write paths, no rendering, no unrelated filters change.

## Shared pattern

For each site, before the documents query runs:

1. Query `document_stage_links` for the stage(s) in scope → collect `additionalIds` (document IDs reached via link).
2. Broaden the docs query:
   - **Single stage, no `package_id` filter**: `.or('stage.eq.<X>,id.in.(<ids>)')` when `additionalIds` is non-empty; otherwise keep the plain `.eq('stage', X)`.
   - **Multi-stage array**: `.or('stage.in.(<X,Y>),id.in.(<ids>)')` else `.in('stage', stageKey)`.
   - **`package_id` filter present**: keep `package_id` bound to the primary-stage branch only (links aren't package-scoped). Since `.or()` can't nest AND cleanly, run **two queries** — (a) existing `package_id` + `stage` filter, (b) `id.in.(additionalIds)` with no `package_id` filter — and merge client-side, deduping by `id`.

Skip the extra query entirely when `additionalIds.length === 0` to preserve existing behavior.

## Files & changes

1. **`src/components/documents/bulk-generate/useTemplatedDocuments.ts`** (~L25-34) — array-stage variant of `.or()`.
2. **`src/hooks/useStageQualityCheck.tsx`** (~L291-294 and ~L652-655) — both `{ count: 'exact', head: true }` queries; single-stage `.or()`.
3. **`src/hooks/usePackageBuilder.tsx`** (~L629-633) — two-query merge (keeps `package_id` on primary branch).
4. **`src/pages/AdminManagePackages.tsx`** — inline `Promise.all` (~L117) and `fetchPackageDocuments` (~L277-287, only when `stageId` provided); two-query merge each.
5. **`src/pages/PackageDetail.tsx`** — `fetchDocuments` (~L530-537); two-query merge.
6. **`src/components/stage/EmailAttachmentsManager.tsx`** — `coreDocsQuery` (~L155-165); single-query `.or()` alongside `is_core`.
7. **`src/components/package-builder/StagePreviewDialog.tsx`** (~L121-127) — single-query `.or()`; embedded `packages:package_id (name)` preserved.
8. **`src/pages/TenantDetail.tsx`** (~L167) — after fetching `(package_id, stage)` for `packageIds`, also fetch `document_stage_links` for those document IDs, then add each `stage_id` into the per-package `Set<number>` keyed by the doc's `package_id` from the first result.

## Out of scope

Rendering, `is_core`/visibility/other filters, write paths, version pinning, grants.

## Verification

- Stage 1114 bulk-generate picker (#1): shared 37 docs appear.
- Stage 1114 core-doc email attachments picker (#6): shared docs with `is_core = true` appear.
- Spot-check one single-stage document in each site to confirm results unchanged.
- Production build passes.
