# Phase 4 P6 slice 5 — Academy builder characterization

**Parent plan:** [Codebase Optimization Plan](../../codebase-optimization-plan-2026-08-28.md) · **Program index:** [Program Index](../../program-index.md)

**Branch cut:** `origin/main` at `9595307cb` (PR #1137 merged)

**Disposition:** first seam implementation-ready; characterizes the whole
file's structure before extracting only the first bounded piece.

## Candidate

`src/pages/superadmin/AcademyAddCoursePage.tsx` — 2,530 lines, 51
`useState`/`useEffect` hooks, 146 top-level function/const declarations, 15
direct Supabase calls (storage upload, `courses`/`course_modules`/
`course_lessons`-family writes, an AI-generation Edge Function call, quiz
generation). Single route: `/superadmin/academy/add-course`
(`src/routes/dashboardRoutes.tsx:614`), guarded by
`allowedRoles={ACADEMY_BUILDER_ROLES}` (`["Team Leader", "Integrator",
"CSC"]` — not `requireSuperAdmin`, despite the `/superadmin/` path prefix;
this is a legacy naming artifact, not evidence of the real access boundary).
Single caller confirmed via repo-wide grep. Zero existing test coverage for
this file or its sibling Academy builder pages
(`AcademyBuilderCourse.tsx`, 1,352 lines; `AcademyBuilderLibrary.tsx`, 607
lines) — `find src/test -iname "*academy*"` returns nothing.

## Reachability check (per the Phase 4 deepening standing practice)

Every handler named below was grep-counted for real call sites before being
treated as live: `handleShowcaseReorder`, `handleShowcaseMove`,
`handleAutoOrganiseShowcase`, `handleRemoveShowcaseMetadata`,
`handleRestoreShowcaseMetadata`, `handleMoveShowcaseItemToModule`,
`handleShowcaseItemsReorder`, `handlePreviewShowcase`,
`handleConfirmShowcase`, `handleThumbnailUpload`,
`handleBannerThumbnailUpload`, `handleSeriesChange`,
`handleSourceTypeChange`, `handleGenerate`, `handleConfirmSplit`,
`handleGenerateQuiz`, `handleSave`. All returned 2+ occurrences (definition
plus at least one JSX/callback reference) — no dead handlers found in this
pass, unlike the `ManageDocuments.tsx` precedent.

## Cross-initiative ownership check (per PR #1137's standing rule)

This surface is Academy course-authoring content, not tenant, authorization,
or client-health data — it does not touch `tenants`, `tenant_members`,
`package_instances`, RBAC capability/role tables, or any Client Health
signal. No RBAC v6, Tenant Operating Model, or Client Health Activity
Analytics packet claims this file's scope. Codebase Optimization owns this
slice outright; no linking needed.

## First seam: showcase reorder/metadata pure logic

The "Showcase" feature (importing a Vimeo showcase/album as a multi-lesson
course draft) has seven handlers plus a shared `applyShowcaseOrder`
helper and a `resequenceParsed` helper (lines 502-637) that are **entirely
pure array/object transformations** — no Supabase calls, no `async`, no
side effects beyond the `setShowcasePreview`/`setShowcaseItems` state
updates and (for two of the seven) a `toast`/`window.confirm` guard. This
is the cleanest possible first extraction: a pure-rule seam per the master
plan's own verification-matrix category ("Pure rule extraction | Focused
unit tests with boundary/error cases, typecheck, net-LOC report"), not a
Supabase-boundary or auth-boundary seam.

Confirmed shared behavior to preserve exactly:

- `resequenceParsed`: after any reorder, renumbers `lesson_number` within
  each `module_number` group, starting at 1, in array order.
- `applyShowcaseOrder`: takes a newly-ordered `parsed` array, resequences
  it, sets `showcasePreview.parsed` to the resequenced array, and
  re-maps `showcaseItems` (the AI-drafted-lesson list) to the new lesson
  numbers by matching on `vimeo_id`/`vimeoId` — silently dropping any
  drafted item whose `vimeo_id` is no longer present in `parsed` (this is
  existing behavior, not a bug to fix).
- `handleShowcaseReorder`/`handleShowcaseItemsReorder`: drag-and-drop
  reorder via `@dnd-kit`'s `DragEndEvent`, id-matched against
  `vimeo_id`/`key` respectively; no-op if `over` is null or
  `active.id === over.id`.
- `handleShowcaseMove`: single-step up/down reorder by index + direction,
  clamped to array bounds.
- `handleAutoOrganiseShowcase`: sorts by `(module_number, lesson_number)`.
- `handleRemoveShowcaseMetadata`/`handleRestoreShowcaseMetadata`: toggle
  between the AI-detected "clean" title and the original Vimeo title with
  numbering, gated behind a `window.confirm` and a no-op guard when
  there's nothing to change.
- `handleMoveShowcaseItemToModule`: relocates one item to the end of a
  target module's existing items, preserving order otherwise.

## Required parity fixtures and verification

Oracle (1) per the characterization-oracle rule: focused unit tests, since
this seam has a clean, fully mockable, Supabase-free boundary and no safe
reason to require a live/authenticated browser pass for pure array logic.
Tests must cover, for each of the seven operations: the real transformation
on a representative multi-module fixture, the resequencing side effect on
`lesson_number`, the `showcaseItems` re-mapping (including an item whose
`vimeo_id` is no longer present, confirming the existing silent-drop
behavior), and every named no-op guard (missing `over`, `active===over`,
out-of-bounds move, no metadata to remove/restore, moving to the same
module).

## Deferred, not in this seam

- `handlePreviewShowcase`/`handleConfirmShowcase`/`handleGenerate`/
  `handleConfirmSplit`/`handleGenerateQuiz`: these call Supabase/Edge
  Functions (AI generation, course/module/lesson writes) and need either
  oracle per-seam or a live characterization pass — separate PRs.
- `handleThumbnailUpload`/`handleBannerThumbnailUpload`: Supabase Storage
  writes — separate seam.
- `handleSave`: the actual course create/update write path — separate,
  higher-risk seam requiring its own oracle decision.
