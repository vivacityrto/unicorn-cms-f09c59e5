# Audit: 2026-08-12 — "No Package" file status + package_stages data gap

**Trigger:** Carl asked for a new file-status category in Manage Documents
alongside "Needs Upload"/"Ready", to flag documents that will never appear
in any real client package regardless of file readiness.
**Author:** Claude (session run by Carl)
**Scope:** New file-status computation in `ManageDocuments.tsx`, one data
correction on `package_stages`. No RLS/trigger changes.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **Two genuinely different "package assignment" signals exist in this
  codebase**, discovered while scoping the feature:
  - Master-level: `documents.stage` (primary) + `document_stage_links`
    (additional stages) → `stages` → `package_stages` (which packages
    include which stage). A static, definitional check — doesn't care
    whether any real tenant has been provisioned. This is what the
    existing `get_document_stage_usage` RPC and (orphaned)
    `DocumentStageUsagePanel` use.
  - Live-instance-level: `document_instances` → `stage_instances` →
    `package_instances` → `packages`. Reflects only what's actually been
    provisioned for real tenants. This is what the live
    `GovernancePackageAssignments` component (shown on
    `GovernanceDocumentDetail`) uses.
- **Presented Carl with real counts for two candidate definitions** before
  building: "no stage at all" (16 documents) vs. "no stage, or stage exists
  but isn't in any package" (156 documents). Carl chose the broader
  definition (156).
- **Real bug, caught by Carl spot-checking a specific document (id 7563,
  "GTONS-03-VIC-Performance Review Form") against `GovernancePackageAssignments`**,
  which showed it correctly assigned to stage "GTO Documents - VIC" /
  package "KS-GTO" — yet the new "No Package" status flagged it. Root
  cause: `package_stages` had zero rows for stage 1115 ("GTO Documents -
  VIC") despite real provisioned usage existing
  (`stage_instances` → `package_instances` → package 1034, "KS-GTO").
  Confirmed this was an **isolated gap, not a systemic reliability
  problem** with `package_stages`: swept the whole table
  (`select count(distinct si.stage_id) from stage_instances si where not
  exists (select 1 from package_stages ps where ps.stage_id =
  si.stage_id)`) and found exactly one affected stage system-wide. That
  one stage affected 38 documents (all sharing it via primary/additional
  stage links), not just the one Carl happened to check.
- Likely origin of the gap: "GTO Documents - VIC" (stage 1115) is a
  state-specific variant of the base "GTO Documents" stage (1082, already
  correctly in `package_stages` at `sort_order 4`) — probably created for
  a VIC-specific product without the corresponding `package_stages` row
  being added at the same time.

## DB changes shipped

Migration: `supabase/migrations/20260812075047_add_missing_gto_documents_vic_package_stage_link.sql`

Inserts the missing row: `package_stages (package_id=1034, stage_id=1115,
sort_order=4)` — `sort_order` matches its sibling stage; duplicate
`sort_order` values are allowed (only `(package_id, stage_id)` is unique).

Applied directly to prod via Supabase MCP `apply_migration`, verified by
re-querying the row and by confirming the affected-document count matched
exactly (156 → 118, a drop of 38, matching the independently-counted
38 documents using stage 1115).

## Code changes

`src/pages/ManageDocuments.tsx`:
- New `FileStatus` value `'no_package'`, computed with priority over file
  readiness (a document with a real file but no package still needs
  attention, just a different kind) — checked first in the ternary chain.
- A stage counts as "has a package" if it's in `package_stages` **or** has
  real `stage_instances` — deliberately not trusting `package_stages`
  alone, given the confirmed gap above. This makes the check resilient to
  any future similar gap without needing another manual data fix.
- New "No Package" tab (ordered: All, Ready, Needs Upload, No Package —
  moved per Carl's request so Ready sits next to All) with live count,
  amber status dot (`bg-amber-500`) in the File column, tooltip "Not
  assigned to any stage that's part of a package".

Branch: `feat/document-versioning-labels` (same PR as the versioning work —
built in the same session, unrelated topic, kept in one PR since both are
still unmerged Manage Documents changes from the same sitting).

## Verification

`tsc --noEmit` and `eslint` clean (same pre-existing `ManageDocuments.tsx`
baseline, no new errors). `npm run build` succeeds. Live-verified against
prod Supabase: tab counts sum exactly to 551 both before (144+251+156) and
after (144+289+118) the data fix; searched for document 7563 directly and
confirmed its dot changed from amber ("no package") to red ("needs
upload") post-fix, matching the expectation that its package issue was
resolved while its separate file-readiness issue remains accurate.

## Decisions

- **Chose the broader "no package" definition (156, not 16)** — Carl's
  call, presented with concrete counts for both options rather than
  picking one silently.
- **Fixed both the specific data gap and the underlying check's
  robustness**, not just one — the data fix corrects `package_stages` for
  its other legitimate uses (e.g. `get_document_stage_usage`,
  `DocumentStageUsagePanel` if it's ever un-orphaned); the code fix
  ensures this feature specifically can't be silently wrong again if
  another gap like this exists or appears later.

## Open questions parked

- Whether `package_stages` has other, currently-undetected gaps of a
  *different* shape (e.g. a stage present in `package_stages` pointing at
  the wrong package) wasn't audited — only the "real usage exists but
  missing from the table entirely" failure mode was checked, since that's
  the one this incident actually surfaced.
