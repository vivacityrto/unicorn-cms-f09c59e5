# Audit: 2026-08-12 — YEAR.MAJOR.MINOR version labels for document_versions

**Trigger:** Carl asked how document versioning actually works (the version panel
"doesn't really show anything"), wanting a human-readable `YEAR.MAJOR.MINOR`
label (e.g. `2026.03.00`) shown wherever versions appear, set explicitly at
import time rather than auto-derived.
**Author:** Claude (session run by Carl)
**Scope:** New column + backfill on `document_versions`, edge function
changes to `import-sharepoint-template`, and a significant UI rework across
the document-versioning surface. No changes to `current_published_version_id`
semantics or the publish/drift-check contract — verified 4 other live
features (`StageDocumentsPanel`, `GeneratePackDialog`, `StageDeliveryPanel`,
the admin governance list) depend on that column's existing meaning.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings (review done before building)

- **Zero documents had ever accumulated multiple versions.** Queried
  `document_versions`: all 538 existing rows sit at `version_number = 1`
  (534 published, 4 still draft), zero archived. The "publish archives the
  previous version" code path had never fired in production.
- **The mental model of "re-link a template creates a new version" didn't
  match the live app.** Traced every caller of `import-sharepoint-template`'s
  `action: 'import'` (the only code that creates a real `document_versions`
  snapshot) and found exactly one live path: the "create new document"
  dialog, which imports once at document-creation time. The "Link to
  SharePoint" button on `GovernanceDocumentDetail` — the one an existing
  document's re-link would actually go through — only did a raw
  `documents.update({ source_template_url })`, no snapshot, no version row.
  The real re-import UI (`GovernanceImportDialog.tsx`) existed but was
  orphaned, same dead-component pattern as the `/document/:id` page retired
  earlier this session.
- **9 documents (CRICOS `NC.02`–`NC.11`, ids 7593–7602) had a SharePoint link
  but zero `document_versions` rows at all.** Traced `bulk-generate-documents-worker`
  and `bulk-generate-phase-documents`: both skip any document with zero
  version rows outright (`no_published_version`/`no_template`), regardless
  of `source_template_url`. These 9 are already silently failing real
  generation today — not a gap this change introduces. No special
  reconciliation needed; running the new "Import New Version" flow on each
  is a normal first import (`nextVersion = 1`), same as any other document.
- **Confirmed replacing a file on an already-published version must not be
  supported.** Carl asked about this directly; the checksum recorded at
  import is what drift-detection and the audit trail (`document_activity_log`,
  `published_at`) key off. Silently swapping the file underneath a live
  version number would desync the checksum from reality and retroactively
  change what a past-dated version label means. The supported path stays
  import-new-version → publish → archive-old, which already existed.
- **Reused existing schema rather than inventing "global" versioning.**
  Carl initially wondered whether the label should be a single version
  shared across the whole document catalog. Investigation showed
  `documents.standard_set` (e.g. "RTO2025") already exists for grouping
  documents by regulatory framework revision — the real "catalog release"
  boundary, when needed, is a `standard_set`-scoped feature, not a flat
  version number for all 551 unrelated documents. Deferred; `standard_set`
  is now surfaced for context next to the version label, no synced-versioning
  logic built.

## DB changes shipped

Migration: `supabase/migrations/20260812060236_add_document_versions_display_version.sql`

- Adds `document_versions.display_version text`, format enforced by
  `CHECK (display_version ~ '^\d{4}\.\d{2}\.\d{2}$')`,
  `UNIQUE(document_id, display_version)`, then `NOT NULL`.
- Backfills all 538 existing rows: `{year(documents.versiondate) ??
  year(document_versions.created_at)}.00.00`. Sourced from the legacy
  `documents.versiondate` field (a real historical date, 2014–2026, present
  on 522/538 documents) rather than `document_versions.created_at` (mostly a
  2026 bulk-import timestamp that would have misdated most rows). Verified
  post-backfill: 0 nulls, 0 format violations, range 2014.00.00–2026.00.00.
- The existing internal `version_number` (int, `UNIQUE(document_id,
  version_number)`, storage-path key) is unchanged — `display_version` is
  purely the human-facing label layered on top.
- Checked `document_versions` RLS proactively (same class of bug as the
  `document_fields` fix earlier this session): its policies already use the
  reliable `is_vivacity_internal`/`unicorn_role`-backed helpers
  (`is_staff()`, `is_super_admin_safe()`), not the broken `global_role`
  column. No RLS fix needed here.

Applied directly to prod via Supabase MCP `apply_migration`.

**Critical bug, caught by Vercel's automated PR review bot, not by this
session's own testing:** adding `display_version` as `NOT NULL` broke two
Postgres RPCs that `INSERT INTO document_versions` without supplying it —
`bulk_create_documents_with_versions` and `publish_document_version`.
This session's original safety sweep only grepped frontend TypeScript for
`.from('document_versions')` calls; it never checked server-side RPC
function bodies, which write to the table through a completely different
code path invisible to that grep. `bulk_create_documents_with_versions`
is genuinely live — called by `useBulkDocumentUpload`, used by
`BulkUploadWithMetadataDialog`, imported by `StageDocumentsPanel.tsx` —
so any bulk document upload was actively broken in production (`23502`
NOT NULL violation) from the moment the schema migration landed until
this fix. `publish_document_version`'s only frontend caller
(`DocumentVersionHistory.tsx`) is orphaned since the `/document/:id`
route retirement, so it wasn't live-broken, but was fixed for the same
reason and to the same standard.

Fix (`supabase/migrations/20260812072400_fix_rpcs_missing_display_version.sql`):
both RPCs now generate a `display_version` themselves, since neither
exposes a parameter for one and both predate the new UI's bump-choice
flow. `bulk_create_documents_with_versions` always creates
`version_number = 1` for a brand-new `document_id`, so
`{current_year}.00.00` can never collide with an existing row for that
document. `publish_document_version` increments `version_number` on an
existing document, so its label is derived from `version_number`
(`{current_year}.00.{lpad(version_number,2,'0')}`) to guarantee it never
collides with a prior call on the same document. Ran a full sweep
afterward (`pg_get_functiondef(...) ilike '%document_versions%' and
ilike '%insert%'`) confirming these were the only two — the third and
final match, `create_targeted_bulk_document_job`, only reads from the
table. Also checked for triggers on `document_versions`: none exist.

Verified the fix directly rather than trusting the SQL by reading it:
called `bulk_create_documents_with_versions` with a real throwaway test
document, confirmed it succeeded and `display_version` was set correctly
(`2026.00.00`), then deleted the test document and confirmed both it and
its cascaded `document_versions` row were gone.

**Follow-up migration:** `supabase/migrations/20260812070901_correct_display_version_from_filename_batch.sql`
— Carl spotted live that 5 documents from the 20 Jul 2026 import batch had
their real version embedded in the SharePoint filename itself (e.g.
`Q1.D4-Facilities-Resources-and-Equipment-Policy-2026.03.00.docx`), which
the backfill above ignored (it only used `documents.versiondate`'s year,
correct for the other 533 documents but not these 5, which have no
`versiondate` signal as good as their own filename). Queried for the exact
population via `file_name ~ '\d{4}\.\d{2}\.\d{2}'`: exactly 5 documents
(ids 7607, 7625, 7626, 7627, 7628), all mismatched the same way, all
corrected to `2026.03.00` to match their filenames.

## Code changes

- `supabase/functions/import-sharepoint-template/index.ts` — `import` action
  now requires `display_version` (format-validated, checked unique per
  document via an app-level pre-check backed by the DB constraint). New
  `check_drift` action + shared `computeDrift()` helper (extracted from
  `handlePublish`'s inline drift-check, reused by both) for the manual
  "Check for Drift" button — read-only, no promotion. Deployed to prod via
  Supabase MCP `deploy_edge_function` (version 386).
- `src/components/governance/GovernanceVersionImportDialog.tsx` (new) —
  two-step "Import New Version" flow: `SharePointTemplateBrowser` (exposes
  drive/item IDs, unlike `SharePointFileBrowser` which only returns a URL)
  → version-label step with a Year/Major/Minor bump-type radio that
  pre-fills a suggested label (still editable), or a plain baseline
  (`{current_year}.00.00`) when the document has no prior version.
- `src/components/governance/GovernanceDocumentDetail.tsx` — swapped the old
  "Link to SharePoint" flow for the new import dialog; replaced the static
  "Published Version" card with a "Current Version" `<Select>` (picking a
  draft opens the existing `GovernancePublishDialog` confirm flow — same
  drift-check + mapping-check as before, just relocated; archived versions
  shown read-only, not actionable); added the "Check for Drift" button;
  surfaced `standard_set` next to the version label.
- `src/components/governance/GovernanceVersionHistory.tsx` — displays
  `display_version` instead of plain `v{version_number}`; added inline-editable
  `notes` per version row (tag-message style), a direct client-side update
  (verified safe given the RLS check above). `display_version` itself is
  also inline-editable (same format validation as import, plus a friendly
  message on the DB's `UNIQUE(document_id, display_version)` constraint —
  Postgres error code `23505` — instead of a raw error). This is a
  deliberate exception to "versions are immutable snapshots": editing the
  *label* doesn't touch the checksum, stored file, or delivery/audit trail
  of what was published, unlike the file-swap request declined above —
  purely a correction tool for backfill/data-entry mistakes, not a way to
  change what a version actually contains.
- `src/pages/ManageDocuments.tsx` — the create-document dialog's first
  import call now requires a `display_version` (pre-filled baseline, no
  bump widget since there's no prior version); the table's row-level
  "link" icon now opens `GovernanceVersionImportDialog` instead of the old
  raw-URL-update (`handleSharePointLinkSelected` removed); the "Version #"
  column now shows `display_version` (query updated to select it) instead
  of the internal `v{version_number}`; removed the legacy, disconnected
  `documents.versionnumber` "Version Number" form field (Carl: "what is the
  version number for?" — traced it to a pre-`document_versions` free-text
  field with no live role beyond a display fallback; left the DB column and
  its read-only fallback display alone since a second, untouched page,
  `AdminManagePackages.tsx`, still writes to it); fixed an unrelated
  pre-existing bug found while in this file — the summary-cards grid was
  `md:grid-cols-4` with only 3 cards (Documents/Categories/Phases), leaving
  a phantom empty column; changed to `grid-cols-3`.
- `src/integrations/supabase/types.ts` — regenerated via Supabase MCP
  `generate_typescript_types` to pick up `display_version`.

Branch: `feat/document-versioning-labels`.

## Verification

Full `tsc --noEmit`, `eslint`, and `npm run build` clean (zero new errors
beyond the pre-existing ~44-problem baseline in `ManageDocuments.tsx`).
Live-verified in a local dev server against prod Supabase per Carl's
explicit request before merge: current-version selector renders and
correctly blocks promoting a non-draft version; the import dialog's
SharePoint browser returns real live files and all three bump computations
(Year/Major/Minor) compute correctly; the row-level import icon and the
Version # column both work from the Manage Documents list entry point (not
just the admin governance list, which Carl flagged isn't the path staff
actually use); notes inline-edit opens/cancels cleanly; Required Merge
Fields (from the earlier RLS fix) still renders populated data correctly
alongside the new panels. No test data was left behind — confirmed via
direct query that no stray `document_versions`/`documents` rows were
created during dry-run testing (dialogs were cancelled before the final
Import/Create click wherever a real mutation would have resulted).

Version-label editing was verified with a real save-and-revert cycle
against document 7628 rather than a dry run (nothing to mutate for a
label-only edit): confirmed an invalid format is rejected client-side
(edit stays open, no request sent), a valid change persists correctly
(`2026.03.00` → `2026.03.01`, verified via direct query and the table
re-rendering), then reverted the same way back to the correct
`2026.03.00`, confirmed restored.

Additionally verified the RPC fix (`bulk_create_documents_with_versions`)
directly against prod with a real throwaway call — see "Critical bug"
above — rather than trusting the SQL by review alone.

## Decisions

- **Per-document versioning, not global/catalog versioning** — see Findings
  above. `standard_set`-scoped catalog releases parked as a future,
  separately-designed feature.
- **No automatic/scheduled drift monitoring** — only the manual "Check for
  Drift" button, reusing the existing checksum-comparison logic read-only.
  Building passive monitoring (a scheduled job re-checking 534+ published
  documents against SharePoint, plus alerting) was judged disproportionate
  scope for a hypothetical problem with no evidence it's actually occurring.
- **Reverting to an archived version is out of scope** — the current-version
  selector shows archived versions for history but they're not selectable;
  `handlePublish` only ever accepts a draft. Confirmed acceptable with Carl.
- **Did not drop the legacy `documents.versionnumber` column** — only
  removed its UI in `ManageDocuments.tsx`. `AdminManagePackages.tsx` has an
  identical, separate form still writing to the same column; dropping the
  column would break that untouched page. Flagged, not actioned.
- **Process lesson, not just a one-off bug:** the pre-migration safety
  sweep for this session and the `document_fields` RLS fix earlier both
  grepped frontend TypeScript for table access. Neither checked
  server-side RPC function bodies, which is exactly where this NOT NULL
  break lived and where a frontend-only grep will always miss writes.
  Any future `NOT NULL`/constraint addition to a table should also sweep
  `pg_proc` definitions for that table name, not just app code — the
  query used here (`pg_get_functiondef(oid) ilike '%<table>%' and ilike
  '%insert%'`) is cheap and would have caught this before it ever
  shipped.

## Open questions parked

- `AdminManagePackages.tsx` has its own duplicate "Version Number" legacy
  field, same as the one just removed from `ManageDocuments.tsx`. Not
  touched this round — a separate page, out of scope for this PR.
- The now-fully-orphaned `DocumentVersionHistory.tsx` component and
  `useDocumentVersions.tsx`'s dead `publishVersion`/generic-RPC path (zero
  importers since the `/document/:id` route retirement) are still sitting
  in the repo. Same shape as the route-retirement cleanup done earlier this
  session — a natural small follow-up, not done here.
