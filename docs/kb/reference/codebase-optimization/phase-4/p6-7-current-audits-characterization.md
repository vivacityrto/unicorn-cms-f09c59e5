# Phase 4 P6 slice 7 — Current Audits characterization

**Parent plan:** [Codebase Optimization Plan](../../codebase-optimization-plan-2026-08-28.md) · **Program index:** [Program Index](../../program-index.md)

**Branch cut:** `origin/main` at `0d59f987b` (PR #1145 merged)

**Disposition:** first seam implementation-ready; characterizes the whole
file's structure before extracting only the first bounded piece.

## Candidate

`src/pages/AuditTemplateBuilder.tsx` — 2,378 lines, 35 `useState`/
`useEffect` hooks, 8 direct Supabase calls (`audit_templates`/
`audit_template_questions` reads and a delete-then-reinsert save/update
pattern). Two routes: `/audits/create-template` and
`/audits/create-template/:templateId` (`src/App.tsx:204-219`), both a
plain `ProtectedRoute` with no role restriction -- this is a full-screen
page mounted directly in `App.tsx`, not through `dashboardRoutes.tsx`'s
nested `DashboardLayoutRoute` pattern (noted historically in
`dashboardRoutes.tsx:551-552` as one of two standalone design decisions
left unscoped by the original dashboard-layout migration). Zero existing
test coverage -- `find src/test -iname "*audit-template*"` returns nothing.

The file also contains an inline sub-component (question-preview
rendering, roughly lines 371-500) unrelated to this seam.

## Reachability check

`handleDragStart`, `handleDragEnd`, `addQuestionToCanvas`,
`deleteCanvasQuestion`, `updateCanvasQuestion` were grep-counted for real
call sites before being treated as live: all 5 returned 2+ occurrences
(definition plus at least one JSX/callback reference). No dead handlers
found.

## Cross-initiative ownership check

The save/submit flow (further into this file, not part of this seam)
reads `profile.tenant_id` and threads a `selected_tenant_id` derived from
audit responses into the saved record -- this *does* touch tenant-scoped
data and would need an RBAC/TOM ownership check before its own extraction.
The seam extracted in this PR is upstream of that: pure canvas
question-list state (drag reorder, add/delete/update), no Supabase calls,
no tenant data. Codebase Optimization owns this specific seam outright;
the later save/submit seam will need its own check when its turn comes.

## First seam: canvas question-list CRUD + drag reorder

Extracted `handleDragStart`, `handleDragEnd`, `addQuestionToCanvas`,
`deleteCanvasQuestion`, `updateCanvasQuestion`, and the `CanvasQuestion`/
`QuestionOption`/`ResponseSet`/`QuestionType` type definitions into
`src/features/audits/templateCanvas.ts` -- all pure array transformations
over `canvasQuestions`, matching the same "pure-rule seam" pattern as the
Academy showcase-ordering seam (PR #1138). The `questionTypes` constant
and the unrelated `hasComplianceOptions`/`getResponseActualValue`/
`calculateComplianceScore` helpers, which also use these types, were left
in the page unchanged (they still import the types back).

One verbatim-preservation detail worth recording: the original
`addQuestionToCanvas` calls `Date.now()` twice, once each for `id` and
`tempId` -- almost always identical values in practice, but the extracted
`buildCanvasQuestion` keeps the same two separate calls rather than
sharing one, since this wasn't the seam to quietly change that.

## Required parity fixtures and verification

Oracle (1): 8 focused unit tests covering the drag reorder (success +
both no-op guards), question building (question-type pick vs.
response-set pick, verifying category always comes from the type not the
set), delete (match + no-op), and update (merge + untouched siblings).

`AuditTemplateBuilder.tsx`: 2,378 -> 2,318 lines (-2.5%) this seam.

## Deferred, not in this seam

- The save/submit flow (`handleSaveTemplate` and onward) -- the actual
  `audit_templates`/`audit_template_questions` write path, including the
  delete-then-reinsert question pattern and the tenant-scoped submission
  logic. Highest-risk remaining handler in this file; needs its own
  characterization pass and an RBAC/TOM ownership check.
- The inline question-preview sub-component (~130 lines) -- a distinct
  rendering concern, not touched by this seam.
- Response-set create/edit dialogs and their own state -- not yet
  investigated.
