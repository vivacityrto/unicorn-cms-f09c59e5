# Audit: 2026-09-04 — Stage Preview silently under-reports usage (missing `package_id` FKs)

**Trigger:** ad-hoc (surfaced during Phase 2.5 lint-debt live verification of
`StagePreviewDialog.tsx`'s `react-hooks/exhaustive-deps` fix — the dialog's
usage counts read "0 configured" for a stage confirmed via direct query to
have real linked content)
**Scope:** the `package_id`-based PostgREST embed queries in
`StagePreviewDialog.tsx` (`fetchStageUsageData`) and `useStageSimulation.tsx`
(`fetchPackagesUsingStage`, surfaced the same class of bug during batch 15's
verification a day earlier). Did not investigate further callers of these
tables, and did not attempt a fix.

## Findings

- Neither `documents.package_id`, `package_client_tasks.package_id`,
  `package_stage_emails.package_id`, `package_staff_tasks.package_id`, nor
  `package_stages.package_id` has a foreign-key constraint to `packages.id`
  (confirmed via `information_schema.table_constraints` — zero rows
  returned for all five). PostgREST needs a declared FK relationship to
  resolve an embedded select like `packages:package_id(name)`; without one,
  the request 400s.
- `StagePreviewDialog.tsx`'s `fetchStageUsageData` issues exactly this shape
  of query against all four of `documents`/`package_client_tasks`/
  `package_stage_emails`/`package_staff_tasks`. All four requests 400 on
  every stage preview. The component catches the failure (`try`/`catch`
  around `Promise.all`) and falls through to its default empty state, so
  the dialog never crashes — it just silently renders "0 configured" /
  "No X configured" for every section, on every stage, always.
- Confirmed with real data: stage 1 ("Financial Viability & ASQAnet RTO")
  has 2 real rows in `documents` (`stage = 1`), verified via direct SQL.
  Its Stage Preview dialog shows "Documents: 0 — No documents configured."
  This is not a rendering bug — the underlying query never returns data to
  render.
- `useStageSimulation.tsx`'s `fetchPackagesUsingStage` hits the same wall
  via `package_stages?select=package_id,packages:package_id(...)` — found
  independently one day earlier during batch 15 verification, same root
  cause, different table.
- Not fixed here — confirmed via `git diff origin/main` that neither
  `StagePreviewDialog.tsx`'s query bodies nor `useStageSimulation.tsx` were
  touched by the lint-debt PRs that surfaced this; both PRs only changed
  dependency-array wiring around pre-existing, unrelated code.

## Code changes (if this entry accompanies one)

- None. This is a read-only finding, filed per direct instruction to
  record it and continue the in-progress lint-debt batch rather than stop
  to fix it.

## Decisions

- Did not attempt to add the missing FK constraints in this session. Doing
  so safely requires first checking for orphaned `package_id` values across
  all five tables (a `package_id` referencing a deleted/renamed package
  would make the constraint fail to apply, or worse, silently exclude rows
  if added with `NOT VALID`) — real investigation work, not a drive-by fix
  alongside unrelated lint cleanup.

## Open questions parked

- Whether `package_id` on these tables was ever intended to have referential
  integrity, or whether it's deliberately loose (e.g., to allow a
  package-scoped row to survive package deletion for historical reporting).
  Whoever picks this up should check `packages` deletion behavior/audit
  history before assuming a plain FK is the right fix.
- Scope beyond these two call sites is unknown — anywhere else in the
  codebase joining through `package_id` on these five tables via a
  PostgREST embed would hit the same 400. Not searched exhaustively here.
- Whether Stage Preview's silently-wrong usage counts have caused any
  actual staff decision to go wrong (e.g., archiving a stage believed to
  have "0 documents configured" when it actually has real linked content)
  is unknown and worth asking whoever uses this feature regularly.
