# Stop stage-entity audit_events writes from failing on uuid type mismatch

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D, L10 item #14

**Scope:** frontend-only, 13 files — no migration, no schema change

**Hosted state changed:** no — this is a code-only fix; no data or DB objects touched

## Decision

Carl explicitly authorized this fix after an AskUserQuestion confirmed
scope: apply the fix to every affected call site, not just the single one
originally documented under L10 #14.

The L10 register documented one occurrence (`AdminManageStages.tsx`'s
archive/restore) and framed the fix as needing "a decision (a new
integer/text audit-events variant column, a lookup table, or accepting
that stage-entity audit events use a different logging path)". Investigating
before starting the fix found that framing was wrong on both counts:

1. **Scope was undersold.** The exact same bug — `entity_id:
   <stageId>.toString()` inserted into `audit_events.entity_id`, a strict
   `uuid` column — existed in **~15 call sites across 10 files**, not one:
   `useStageReplacement.tsx`, `useStageExportImport.tsx` (export + import),
   `StageBuilder.tsx`, `useStageDependencies.tsx`, `useStageTemplateContent.tsx`
   (4 of its `audit_events` inserts), `StageDocumentsPanel.tsx` (link +
   unlink), `StageFrameworkSelector.tsx`, `useStageDuplication.tsx`,
   `useStageStandards.tsx`, and one leftover call in `AdminStageDetail.tsx`
   (which otherwise already uses the correct pattern in its other 4 calls).
   None of these throw on failure — Supabase JS resolves with
   `{ error }` rather than rejecting an unchecked `.insert()` — so every one
   of these actions has always succeeded from the user's perspective while
   silently never writing an audit trail entry.
2. **No schema decision was actually needed.** The correct fix already
   existed and was working in the same codebase: `AdminStageDetail.tsx`'s
   other 4 audit calls and `useStageTemplateContent.tsx`'s own
   `logStageTemplateAudit()` helper both already use
   `entity_id: crypto.randomUUID()` with the real numeric stage id kept in
   `details.stage_id` — exactly matching what `useStageAuditLog.tsx` (the
   stage detail page's audit-log reader) already expects and filters on
   (`.eq('details->>stage_id', ...)`). This is a purely mechanical
   consistency fix, not a product/schema decision.

Two other tables were investigated and found **not** to have this bug —
confirmed live via `information_schema.columns`, not assumed from the TS
types (which give `string | null` for both a `uuid` and a `text` column,
so they can't distinguish the two): `package_builder_audit_log.entity_id`
and `client_audit_log.entity_id` are both genuinely `text`. Their many
`entity_id: <id>.toString()` call sites (`usePackageBuilder.tsx`,
`useStageTemplateContent.tsx`'s other 3 calls, `PackageStagesManager.tsx`,
`StageDetailSection.tsx`, `useClientManagement.tsx`,
`useClientTaskInstances.ts`, `useStaffTaskInstances.ts`, etc.) are correct
as written and were left untouched.

## Implementation

For each of the ~15 broken `audit_events` inserts: changed `entity_id` to
`crypto.randomUUID()` and added `stage_id: <the real numeric id>` into the
`details` object (or, for `useStageTemplateContent.tsx`'s 4 call sites,
replaced the inline insert with a call to the file's own existing
`logStageTemplateAudit()` helper, which already does this correctly).

Also fixed `useStageAnalytics.tsx`, which reads `audit_events` back for
`entity = 'stage'` and previously treated `entity_id` as if it held the
real stage id (`parseInt(e.entity_id)`, `.in('entity_id', stageIds)`) —
this read pattern would have silently returned zero/garbage results going
forward now that writes succeed with a genuinely random `entity_id`. Added
a `getStageIdFromDetails()` helper reading `details.stage_id` (matching
`useStageAuditLog.tsx`'s existing convention) and updated both the
"high-risk stages by recent edit count" query and the "stage change
activity feed" query to use it; updated the `StageAuditEvent` interface's
`entity_id` field to `stage_id` and fixed `AdminStageAnalytics.tsx`'s
per-event "view stage" link to route on `stage_id` instead of the old
`entity_id`. The one dead reader query for `action = 'stage.certified'`
(an action nothing ever writes — confirmed via repo-wide grep) was left
untouched: a separate, pre-existing action-name mismatch bug, unrelated to
the entity_id/uuid issue and out of scope here.

## Postflight

- `npm run typecheck`, `npm run test:frontend` (321 passed, 15 skipped),
  `npm run build` — all clean.
- `LINT_RATCHET_BASE=origin/main node scripts/lint-ratchet.mjs` — no
  regressions across all 13 changed files.
- Live verification (Playwright, authenticated SuperAdmin): created a
  disposable test stage (`ZZTEST_p4d14_verification`, id 1149), archived
  then restored it — both `audit_events` inserts returned 201 (not the
  old 400), with real `entity_id` uuids and `details.stage_id = 1149`;
  the stage's own Audit Log tab correctly showed both entries. Stage
  Analytics' activity feed rendered the same two events with correct
  titles/timestamps, and its "view stage" link navigated to
  `/admin/stages/1149` (a real numeric id, not a uuid). Zero console
  errors throughout. Test stage cleaned up via direct SQL afterward (no
  UI delete option exists for stages) — confirmed 0 rows remain with
  that name; the 2 `audit_events` rows from the archive/restore are the
  real audit trail, not residue.

## Open questions parked

- L10 items #10, #15, #18 remain in the P4-D queue, each still needing its
  own design decision before a fix — not touched here.
