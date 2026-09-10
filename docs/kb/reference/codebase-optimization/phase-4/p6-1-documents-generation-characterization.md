# P6-1 Documents/Generation Characterization

> **Status:** characterization only — no extraction, no behavior change
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md) — Phase 4, P6 hotspot slice #1
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Prerequisite:** none — first Phase 4 slice, taken in the P6 order

## Purpose and non-goals

This packet documents the current, real behavior of the documents/document-generation
feature area — the largest single hotspot in the P6 table — before any
extraction is attempted. Per the master plan's Phase 4 rule, this is a
characterization pass only: it authorizes no code change, no route change, no
Edge Function change, and no schema/RLS change. The four "first seams" named
by the plan (filters/selection model, status transitions, delivery commands,
dialog controllers) are mapped to their current file/line locations below so a
later extraction PR has a proven baseline to preserve.

Out of scope for this packet: any actual extraction, the adjacent evidence/
upload dialogs (`UploadDocumentDialog`, `CreateEvidenceRequestDialog`,
`EvidenceUploadWizard` — same folder, different workflow), `useStageVersions.tsx`
(stage-level, not document-generation), and any Edge Function contract change.

## Surface inventory

Measured at `origin/main` (this worktree's branch point), 2026-09-10.

| File | Lines | Role |
|---|---:|---|
| `src/pages/ManageDocuments.tsx` | 2,788 | Admin document catalogue: list, filters, category tree, template CRUD, SharePoint template import, launches Bulk Generate. The single largest orchestrator in this area. |
| `src/components/documents/bulk-generate/targeted/TargetedMode.tsx` | 1,088 | Bulk-generate targeted flow: tenant/CSC/search filters, tenant→package→stage→document selection tree, launches preview/create. |
| `src/pages/BulkDocumentJobProgress.tsx` | 1,375 | Single job detail: polling, status-transition derivation, retry/cancel/skip, per-item progress, nested retry/skipped dialogs. |
| `src/components/governance/GovernanceDeliveryDialog.tsx` | 722 | Single-document, many-tenant delivery dialog (used from `ManageDocuments`); original home of the delivery-guard logic, now shared via a hook. |
| `src/pages/BulkDocumentJobsList.tsx` | 381 | Bulk-generation job list/history. |
| `src/components/documents/tabs/GeneratedDocumentsTab.tsx` | 397 | Per-tenant documents tab, hosted inside `ClientDetail`'s `DocumentsHub` — the confirmed live successor to the retired `TenantDocuments*` family. |
| `src/hooks/useMissingMergeFields.tsx` | 322 | Per-document merge-field gap detection; an older, separate implementation from the delivery-guards hook below, with conceptual overlap. |
| `src/components/documents/bulk-generate/DocumentFilterDialog.tsx` | 289 | Document multi-select filter dialog — core of the filters/selection-model seam. |
| `src/components/governance/GovernanceVersionImportDialog.tsx` | 216 | Version-state import dialog, used from `ManageDocuments`. |
| `src/components/documents/bulk-generate/DeliveryGuardPanel.tsx` | 220 | Renders delivery-guard output plus an acknowledgement gate before launch. |
| `src/hooks/useExcelGeneration.tsx` | 138 | Single-document Excel generate/download plus in-flight state. |
| `src/hooks/useDocumentDeliveryGuards.ts` | 171 | Delivery readiness: merge-field completeness plus TGA snapshot presence, per pair, resolved to `complete`/`partial`/`incomplete`. Already extracted once (out of `GovernanceDeliveryDialog`) to be shared with bulk generate — a precedent for this packet's proposed direction. |
| `src/components/documents/bulk-generate/PreviewPanel.tsx` | 122 | Shows launcher preview results before commit. |
| `src/components/documents/bulk-generate/useBulkGenerateLauncher.ts` | 146 | Pure command layer over the `bulk-generate-documents-launcher` Edge Function — the delivery-commands seam. |
| `src/hooks/useDocumentActivity.tsx` | 64 | Logs download/delivery activity events. |
| `src/components/documents/bulk-generate/useTemplatedDocuments.ts` | 141 | Loads documents eligible for generation given selected stages. |
| `src/hooks/useDocumentCategories.ts` | 33 | Category value→label map, used by list/filter UI. |
| `src/components/documents/bulk-generate/useTenantSharepointLiveness.ts` | 52 | Per-tenant SharePoint connectivity check feeding selection eligibility. |
| `src/components/documents/bulk-generate/useBulkGenerateClientTree.ts` | 36 | Tenant→package→stage tree for selection. |
| `src/pages/BulkGenerateNew.tsx` | 83 | Thin wrapper: loads tenants, renders `TargetedMode`. |

19 files, ~10,650 lines total in this inventory (excludes the adjacent
evidence/upload dialogs and `useStageVersions.tsx`, both out of scope above).

## Edge Functions in this feature's contract

| Function | Role |
|---|---|
| `bulk-generate-documents-launcher` | Command endpoint: preview, create, cancel, retry, skip_items, preview_targeted, create_targeted, requeue_skipped, create_delivery. Server side of `useBulkGenerateLauncher.ts`. |
| `bulk-generate-documents-worker` | Executes queued generation items. |
| `bulk-generate-documents-resume-stalled` | Cron-style backstop that resumes/flags stalled jobs — source of "resume" behavior named in the plan's required characterization. |
| `deliver-governance-document` | Delivery execution for `GovernanceDeliveryDialog`'s single-document path. |
| `generate-document`, `generate-document-description` | Single-document generation/description. |
| `generate-excel-document` | Excel-specific generation, backing `useExcelGeneration`. |

No Edge Function contract changes are proposed by this packet. Any future
extraction keeps every one of these contracts byte-identical.

## The four seams, as they exist today

| Seam | Current location |
|---|---|
| Filters and selection model | `TargetedMode.tsx` state block (tenant/CSC/search filters, triple selection, itemized rows) plus the whole of `DocumentFilterDialog.tsx` for document picking. `ManageDocuments.tsx` has its own separate list-filter state (search/category/status) that is **not shared** with the bulk-generate filters — two independent implementations of "filter a document list," not one seam split across two files. |
| Status transitions | `BulkDocumentJobProgress.tsx`: a `TERMINAL` status set, dialog/loading state, retry-eligible/skipped derivation, and the `isRunning`/`isStalled`/`isPolling`/`canRetry` flags computed from job/item rows; polling via a fixed `refetchInterval`. |
| Delivery commands | `useBulkGenerateLauncher.ts` (all launcher actions, consumed by `TargetedMode.tsx` and `BulkDocumentJobProgress.tsx`) plus `GovernanceDeliveryDialog.tsx`'s direct call to `deliver-governance-document` for the single-document path — **two separate delivery-command contracts**, not one, corresponding to the bulk vs. single-document flows. |
| Dialog controllers | `DocumentFilterDialog.tsx`, `DeliveryGuardPanel.tsx`, `PreviewPanel.tsx` (bulk path) plus the retry/skipped-items dialogs nested inline inside `BulkDocumentJobProgress.tsx` (not extracted as siblings — an existing routing-hoist comment at `dashboardRoutes.tsx` confirms this was a deliberate prior decision, not an oversight), plus `GovernanceDeliveryDialog.tsx`/`GovernanceVersionImportDialog.tsx` (single-document path). |

**Key finding:** "Documents/generation" is really **two parallel, mostly
independent workflows** — the bulk/targeted generation path (`TargetedMode` →
`useBulkGenerateLauncher` → `BulkDocumentJobProgress`) and the single-document
governance-delivery path (`ManageDocuments` → `GovernanceDeliveryDialog` →
`deliver-governance-document`) — that happen to share only the delivery-guard
readiness logic (`useDocumentDeliveryGuards`, already extracted) and, loosely,
the merge-field-gap concept (`useMissingMergeFields`, a separate older
implementation covering similar ground). A single unified "documents feature
boundary" is not obviously the right target; the two paths may warrant
separate, narrower extractions instead. This is a characterization finding to
weigh before scoping the actual extraction PR, not a decision made here.

## Required behavioral characterization

### List (catalogue view — `ManageDocuments.tsx`)

- Search/category/status filters are local component state, applied
  client-side over a single fetched document-template list.
- Admin visibility gate: `isSuperAdmin || isVivacityStaffRole(...)`, checked
  in-component (line ~1568) — **not** a route guard; the route itself is the
  plain `ProtectedRoute` group with no `requireSuperAdmin`/`allowedRoles`.
- Category tree drives grouping/filtering of the same fetched list, not a
  separate query.

### Generate (both paths)

- **Bulk/targeted:** `TargetedMode.tsx` builds a tenant→package→stage→document
  selection, calls `useBulkGenerateLauncher`'s `preview_targeted` then
  `create_targeted`; `PreviewPanel` shows the preview result before commit;
  `DeliveryGuardPanel` blocks commit on an unacknowledged incomplete-readiness
  state from `useDocumentDeliveryGuards`.
- **Single-document:** `ManageDocuments.tsx` launches `GovernanceDeliveryDialog`
  directly for a chosen template/tenant pair; the dialog independently computes
  readiness (via the same shared `useDocumentDeliveryGuards` hook) and calls
  `deliver-governance-document`, a different Edge Function than the bulk path.

### Resume

- `bulk-generate-documents-resume-stalled` is a cron-style backstop, not a
  user-initiated action from the frontend UI investigated here — no in-app
  "resume" button was found in `BulkDocumentJobProgress.tsx`; resume is
  server-driven for stalled jobs. `BulkDocumentJobProgress.tsx` does expose
  user-initiated **retry** (a different action, for failed/skipped items, via
  the `retry`/`skip_items`/`requeue_skipped` launcher commands) — retry and
  resume are not the same behavior and must not be conflated in a later
  extraction.

### Deliver

Two independent contracts, as above: `useBulkGenerateLauncher`'s
`create_delivery` command (bulk path) vs. `GovernanceDeliveryDialog`'s direct
`deliver-governance-document` call (single-document path). Both gate on
`useDocumentDeliveryGuards` readiness first.

### Version-state

`GovernanceVersionImportDialog.tsx` handles version import for the
single-document/governance path in `ManageDocuments.tsx`. No equivalent
version-import flow was found in the bulk/targeted path — version-state
appears to be a governance-path-only concept in the current code, not a
shared concern across both workflows. This should be confirmed, not assumed,
before any extraction treats it as a shared seam.

## Route registration and guard tier

All documents/generation routes sit under the plain `ProtectedRoute` +
`DashboardLayoutRoute` group (`src/routes/dashboardRoutes.tsx`) — no
`requireSuperAdmin`, no `allowedRoles` at the router level:

| Route | Component |
|---|---|
| `/manage-documents` | `ManageDocuments` |
| `/manage-documents/bulk-generate/new` | `BulkGenerateNew` |
| `/manage-documents/bulk-jobs` | `BulkDocumentJobsList` |
| `/manage-documents/bulk-jobs/:id` | `BulkDocumentJobProgress` |
| `/tenant/:tenantId` | `ClientDetail` (hosts `GeneratedDocumentsTab` via `DocumentsHub`) |

Each of the three bulk-generate pages instead does an identical page-local
`useUserAccess().isVivacityStaff` check, rendering a shell-wrapped
"you don't have access" message rather than a pre-shell redirect — confirmed
via each file plus the routing-hoist migration comment in
`dashboardRoutes.tsx`, which explicitly preserved this as intentional (not
one of the flagged hard-redirect pages). `ManageDocuments.tsx` gates its own
admin view the same way. This is the same "page-local check retained
deliberately" pattern already ruled on in [ADR-029](../../decision-trail.md#adr-029)
for a different route family — any future extraction here preserves these
checks unchanged for the same reason, rather than treating them as
redundant-by-construction.

Also worth noting for the retired-file sweep: `TenantDocuments.tsx`,
`TenantDocumentsHub.tsx`, `TenantDocumentDetail.tsx`, and
`TenantDocumentDetailWrapper.tsx` are already retired/unreachable (Phase 2.6
P4-B/P6-B) — their routes `Navigate` straight to `ClientDetail`'s `documents`
tab. No further action needed on them from this packet.

## Open questions before scoping an extraction PR

1. Should the bulk/targeted path and the single-document governance path be
   extracted as **two separate, narrower feature boundaries** rather than one
   unified "documents" module, given how little they actually share?
2. Is `useMissingMergeFields.tsx`'s merge-field-gap logic meant to converge
   with `useDocumentDeliveryGuards.ts`'s readiness logic, or are they
   deliberately separate (one older, one newer)? Needs a source-history/PR
   check before either is touched.
3. `ManageDocuments.tsx` at 2,788 lines is far over the plan's ~600-line
   per-slice orchestrator target — a first extraction pass there (category
   tree, template CRUD, list/filter state) may be worth sequencing before the
   bulk-generate seams, since it is the single largest file and the most
   self-contained sub-concern (template CRUD does not touch delivery/status
   logic at all).

## Correction after deeper `ManageDocuments.tsx` investigation (2026-09-10)

Question 3's claim that template CRUD "does not touch delivery/status logic
at all" is true only narrowly (it doesn't call bulk-generate/delivery Edge
Functions) — a closer read found real coupling: the fetched `documents` list
and its refresh function are shared by CRUD, list/filter rendering, and
inline actions; `selectedDocuments` is shared between CRUD bulk-delete and
the unrelated bulk-send feature; and there are two independent, overlapping
implementations of category-fetching in the same file. There is also **no
existing test coverage** for this file at all, unlike the Phase 3 P7-B
lifecycle precedent, which had a 13-test characterization suite as an oracle.

Given that, the safe first extraction is narrower than "template CRUD": a
pure-function boundary only. `deriveCategoryFromFilename`,
`deriveFrameworkFromRootFolder`, and `deriveFormatFromFile` (the latter
hoisted out of the component body, where it was previously non-reusable)
moved to `src/features/document-templates/derive.ts`, with new focused unit
tests (`src/test/admin/document-template-derive.test.ts`) — this repo's first
test coverage of any kind for this feature area. No state, query, or mutation
extraction is attempted here; that remains blocked on writing a real
characterization test suite first, matching the Phase 3 precedent's own
requirement.

## Second extraction: delete/bulk-delete, plus two dead functions removed

Deepening the same slice per the standing "iterate a slice across bounded
PRs" practice: re-investigating the file after the pure-function PR found
`handleDuplicateDocument` and a `window.confirm`-based `handleDeleteDocument`
were both fully dead — zero call sites anywhere in the file, confirmed by
occurrence-count grep before removal. The actual live delete flow (single-
document delete with an impact preview, and bulk-delete) was inline JSX/
closures with no name and no oracle. Extracted verbatim into
`src/features/document-templates/useDocumentTemplateDeletion.ts`, with 8
new focused unit tests as the oracle (per the AGENTS.md characterization-
oracle rule) — no live Playwright pass, since the mutation logic now has
real unit coverage and this file manages the shared production document-
template catalogue, not tenant-scoped test data suitable for a live pass.

## Third finding: Bulk Send has been silently dead since 2025-12-18 — retired, not fixed

Continuing to deepen the same file, `isBulkSendDialogOpen`'s only `true`
assignment was found to not exist anywhere in the file — the entire Bulk
Send dialog (send selected documents to a specific user by email, or to a
filtered list of tenants) was unreachable. `git log -S` traced this to a
single Lovable auto-commit (`a8f1c8ad7`, 2025-12-18, author
`gpt-engineer-app[bot]`) that restructured a JSX fragment holding two
sibling buttons (Delete and Send) into a group with only one, silently
dropping the Send trigger while leaving its handlers, dialog, and state
fully intact underneath — the exact "Lovable bundles unrequested changes
into an unrelated fix" failure mode this repo's own guardrail section
already warns about. The feature was live and functional for however long
it existed before that commit, then silently unreachable for roughly nine
months with no error, log, or user report.

Presented to Carl as a product decision (restore the trigger vs. retire the
feature), not decided unilaterally. Carl's decision: **retire it.** The
`GovernanceDeliveryDialog`/`deliver-governance-document` "Deliver to
Clients" flow is the canonical multi-tenant delivery path — it does
everything Bulk Send's tenant-send path did, plus real readiness gating
(merge-field completeness, TGA snapshot staleness, SharePoint governance-
folder presence) and per-tenant delivery-history tracking that Bulk Send
never had. Bulk Send's only capability Deliver to Clients doesn't cover —
sending to one specific individual by email rather than a tenant — was
confirmed not needed.

Removed entirely: the dialog JSX, both send handlers
(`handleBulkSend`/`handleBulkSendToTenants`) and their dialog-close/
selection helpers, `fetchBulkSendUsers`/`fetchBulkTenants` and their mount-
time calls, all `bulkSend*`/`bulk*Tenant*` state (14 `useState` declarations
total), and the now-unused `Send`/`Mail`/`Building2` icon imports. No
replacement code — this was a straight deletion of unreachable code, not an
extraction. Net effect: `ManageDocuments.tsx` went from 2,581 to 2,187 lines
in this one PR (394 lines), on top of the 207 already removed by the two
earlier extractions — 2,788 → 2,187 total, about 21.5%, across three PRs in
this slice so far.

## Fourth pass: investigating the create/edit template flow

Re-investigated the file for the next seam per the deepening rule. The
create/edit dialog (`formData`, `createStep` two-step wizard, SharePoint
browse/import, `handleCreateDocument`, `handleNextFromBrowse`,
`maybeGenerateDescription`) is confirmed live and reachable end to end — no
dead handlers there. But the same investigation found more dead state one
level in: `uploadedFiles`/`handleFileUpload`/`handleRemoveFile` (a manual
file-upload path with no `<input type="file">` left anywhere in the JSX —
the SharePoint browser replaced it) and `pendingImportDocId` (set and
cleared around the import call, but its value was never read anywhere).

One correction to the investigation that surfaced this: `existingFiles` is
**not** dead, despite looking similar in shape to `uploadedFiles` — it's
populated on edit (from the document's already-uploaded files) and read on
save to preserve them, since this dialog has no interactive replace/remove
affordance. Verified directly (not just trusted) before removing anything
adjacent to it, given the two states looked superficially identical.

Removed: `uploadedFiles` state and its two dead handlers, `pendingImportDocId`
and its two write-only call sites, and simplified `handleCreateDocument`'s
file-array construction to read directly from `existingFiles` (the
`uploadedFiles`-driven upload branch could never run, so removing it changes
nothing observable). `ManageDocuments.tsx`: 2,187 → 2,157 lines.

The create/edit dialog's real logic (the step machine, the two Supabase
mutation branches, the SharePoint import call) remains untouched and is the
next candidate — recommended smallest next cut: extract just the
create/update Supabase calls plus `maybeGenerateDescription` into a
`useDocumentTemplateSave`-style hook (mirroring `useDocumentTemplateDeletion`),
leaving the step machine and dialog JSX in the parent. This flow has zero
existing test coverage, so that extraction needs its own oracle chosen per
the characterization-oracle rule before proceeding — not authorized by this
packet.

## Fifth extraction: create/update save logic

Implemented the recommended next cut above. `handleCreateDocument`'s two
Supabase mutation branches (update for edit, insert + SharePoint import for
create) moved verbatim into `useDocumentTemplateSave`
(`src/features/document-templates/useDocumentTemplateSave.ts`), taking
`formData`, `editingDocumentId`, `existingFiles`, `selectedTemplate`,
`newDocDisplayVersion`, the creator's user UUID, and `nextOrderNumber` as
explicit inputs, with the dialog's own reset logic passed in as a
`resetAfterSave` callback — the step machine and dialog JSX stay in the
parent, unchanged. `maybeGenerateDescription` was left in place; it's
called from `handleNextFromBrowse` (the step-transition handler), not from
the save path itself, so it wasn't part of this seam.

Oracle: this flow had zero existing coverage, so oracle (1) was used —
7 new focused unit tests against the hook (mocked Supabase), covering the
update branch's success/error/file-preservation, and the create branch's
missing-template guard, successful insert-then-import, insert succeeding
with the import failing (verified the document row is kept and the dialog
still resets, matching the original's non-rollback behavior), and insert
failure. Additionally ran one scoped, read-only, authenticated SuperAdmin
Playwright check (`e2e/personas/superadmin.spec.ts`, added to the existing
persona spec) confirming the Create Document dialog still opens on its
browse step post-extraction — a structural-wiring smoke check on top of the
unit-test oracle, given this seam moves real mutation logic and touches the
dialog's JSX wiring, not just internal function bodies. No document was
created, edited, or deleted by the check.

`ManageDocuments.tsx`: 2,157 → 2,050 lines.

## Running total

`ManageDocuments.tsx`: 2,788 → 2,050 lines (-738, ~26.5%) across five PRs in
this slice, plus a real 9-month-old production regression found and
resolved (Bulk Send) — none of it forced through a single large rewrite.
Remaining open seams: category-tree state and the still-present
category-fetch duplication between the local `fetchCategories` and the
`useDocumentCategories` hook, plus the dialog's step-machine/JSX itself
(left as-is deliberately — tightly coupled to `createStep`, lower value to
extract further once its mutation logic already has an oracle).

## Definition of done for this packet

This characterization packet, plus its five extractions and the Bulk Send
retirement above, is complete once the full lint-ratchet/typecheck/test/
build chain passes for each PR. Four of the five PRs needed no Playwright
pass (compiler-/test-provable pure moves, or deletion of already-unreachable
code); the fifth (create/update save extraction) added one scoped read-only
Playwright check alongside its unit-test oracle, since it moved real
mutation logic and touched dialog JSX wiring. Any further extraction
(category-tree state, the category-fetch duplication, or the dialog's step
machine) needs its own oracle chosen per the characterization-oracle rule,
and is not authorized by this packet.
