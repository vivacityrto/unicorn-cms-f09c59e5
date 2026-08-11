# Audit: 2026-08-11 — audit-feature-review

**Trigger:** ad-hoc
**Scope:** Carl asked for a full correctness pass on the "Audit" feature (`client_audits` module) — the RTO compliance health-check audits staff conduct against client tenants — following the two duplicate-row race fixes earlier today. Combined a background code-review pass over the whole feature surface with live testing: created a real test audit against Test RTO A (tenant 7517), exercised rating/notes/findings, verified fixes live, then cleaned up. Did not exercise Documents/evidence-upload, AI analysis, report generation/release, or the Closing Meeting phase this session — parked below.

## Findings

**Corrected a false positive first.** A background code-review agent flagged that `useAuditWorkspace.ts`'s `upsertResponse` still used the old check-then-insert/update pattern despite the morning's fix. Verified directly against `origin/main` (`git show origin/main:src/hooks/useAuditWorkspace.ts`) — the real atomic-upsert fix is genuinely there. The agent had read the shared checkout at the repo root, which was ~20 commits behind `origin/main` at session start and never pulled after this session's merges landed — an environment-hygiene gap, not a code bug. Flagged to Carl; not pulled unilaterally since another tool had an unrelated uncommitted change there and Carl's live dev-server session was pointed at it.

**Three compounding bugs found in the audit-lifecycle Timeline logging, live-verified via a real test audit:**
- `client_timeline_events`'s `timeline_valid_event_type` CHECK constraint has never included `audit_created` or `audit_completed`, despite both `useClientAudits.ts` (create) and `useAuditWorkspace.ts` (complete) always trying to insert them — same root cause as `2026-08-10-timeline-event-type-constraint-drift.md` (constraint hand-rewritten from scratch by every migration that touches it). Confirmed zero rows of either type ever existed.
- Both inserts were also missing the required `client_id` column entirely (`NOT NULL`, no default, no trigger — every other insert site in the app supplies it explicitly, e.g. `client_id: String(tenantId)` in `ClientFilesTab.tsx`). Would have kept failing on a NOT NULL violation even after the CHECK-constraint fix.
- Both inserts also passed `source: 'internal'`, which was never a valid value for `client_timeline_events.source` (`CHECK ... IN ('unicorn','microsoft','system','user')`) — most likely a mix-up with the separate `visibility` column, which *does* accept `'internal'`. Switched both to `source: 'unicorn'` (a direct in-app staff action).
- All three bugs stacked in the same two insert calls, so fixing only one or two would still have left the insert silently failing. Verified end-to-end via a live test audit before and after: pre-fix, creating the test audit produced a real `400` in the browser network tab; post-fix, a manually-simulated insert with the corrected shape succeeded and was cleaned up immediately.
- Both call sites wrap the insert in `try {} catch {}` (correctly non-blocking — a missing Timeline entry shouldn't fail audit creation/completion) but previously swallowed the error with zero logging. Added `console.error` so this class of drift is at least visible next time, without changing the non-blocking behaviour.

**Two silent-failure UX bugs in `useAuditWorkspace.ts`, found by code review, not yet live-verified against a real RPC failure:**
- `useAuditStatusTransition`: if `sync_audit_actions_to_client_items` throws when completing an audit (permission error, bad tenant mapping, etc.), the failure was indistinguishable from "no actions to sync" — same swallowed-`try/catch`, but the resulting toast (*"Audit marked complete. No open actions to sync."*) actively told the auditor everything was fine when corrective actions may never have reached the client's action plan. Now surfaces a distinct error toast when the sync throws, and marks the audit complete regardless (unchanged behaviour — the completion itself must not block on this).
- `useUpdateAudit` (the shared mutation behind every audit-detail field edit, including the debounced score write in `useAuditScore`) had no `onError` at all — any failed save of title, dates, executive summary, or score was completely silent. Added a generic `onError` toast.

**One DOM-nesting bug, found live via a real React console warning:** `DocumentReviewPhase.tsx`'s section header wrapped a `<Badge>` (renders a `<div>`) inside a `<p>` — invalid HTML, only triggered once a section actually has a findings-required count > 0 (i.e. once you rate something Non-Compliant/At Risk with no finding yet). Reproduced live by rating a real question, fixed by changing the wrapper to a `<div>`.

**One metadata bug, found by code review while fixing the Timeline inserts:** `useAuditWorkspace.ts`'s `audit_completed` insert passed `metadata: JSON.stringify({...})` into a `jsonb` column — would have stored a jsonb *string* scalar instead of a queryable object. Harmless in practice since this insert had never once succeeded before today's fix (nothing has ever read that field), but fixed alongside it (pass the object directly).

**Live-verified working correctly, no changes needed:**
- The `client_audit_responses` atomic-upsert fix from this morning: rated a question, then edited its notes (a direct re-test of the original paste-not-saving bug) — one row throughout, both fields correctly present together, no duplication.
- `EvidencePanel`'s evidence-gated "Analyse with AI" button and `id`-required "Link evidence" button, exactly as diagnosed earlier today.
- Finding creation (auto-generated finding code, correct linkage to the response/section) and the auto-derived audit risk rating (correctly flipped to "Medium Risk" after a medium-priority finding was raised).
- `client_audit_findings`/`client_audit_actions`/`client_audit_documents` — all genuine one-to-many inserts with no natural key to race on; not vulnerable to the duplicate-row bug class.

**Lower-confidence / parked, not actioned this session:**
- Legacy `compliance_audits` system (`useComplianceAudits.tsx`, still routed at `/compliance-audits/:tenantId/audit/:auditId`) hardcodes 2 points per question rather than reading each question's real `score_compliant`, unlike the current `useAuditScore`. Checked live: `compliance_audits` has **zero rows ever** and all 426 `compliance_template_questions` are already worth exactly 2 points, so this drift has never actually produced a wrong score and can't today. Real inconsistency, zero live impact — left alone rather than touching a fully dormant legacy system.
- Direct URL navigation to `/audits/:id?tab=findings` doesn't select the Findings tab (lands on Overview instead, though the tab's own count badge is correct) — clicking the tab works fine. Minor deep-link gap, not investigated further.
- `NewAuditModal.tsx`'s dialog is missing a proper `DialogTitle` (Radix a11y console error) — traced to the shared `AppModal`/`AppModalTitle` wrapper (`@/components/ui/modals`), not anything audit-specific. Out of scope for an audit-feature fix; would need its own investigation across every `AppModal` consumer app-wide.
- Edge functions `draft-finding`, `analyse-evidence`, `record-finding-decision` rely on RLS alone for authorization rather than an explicit `check_permission` gate (unlike `release-audit-report`, which documents why RLS alone was insufficient there). Didn't inspect the backing RLS policies closely enough to call this a confirmed gap.
- Did not exercise: document upload + AI analysis, report generation (`generate-client-audit-report`/`-docx`), report release, the Closing Meeting phase, or audit scheduling/appointments.

## KB changes shipped
- No changes.

## Code changes (if this entry accompanies one)
- `src/hooks/useAuditWorkspace.ts`: `useAuditStatusTransition` now distinguishes an action-sync failure from a genuine zero-actions case and toasts accordingly; `useUpdateAudit` gained a generic `onError` toast; the `audit_completed` Timeline insert now includes `client_id`, uses `source: 'unicorn'`, passes `metadata` as a plain object, and logs on failure instead of swallowing silently.
- `src/hooks/useClientAudits.ts`: the `audit_created` Timeline insert now includes `client_id`, uses `source: 'unicorn'`, and logs on failure.
- `src/components/audit/workspace/DocumentReviewPhase.tsx`: section header's completion-count wrapper changed from `<p>` to `<div>` so the findings-required `<Badge>` is valid HTML.
- `supabase/migrations/20260811055333_timeline_add_audit_lifecycle_event_types.sql`: rebuilds `timeline_valid_event_type` from its live definition (per the established lesson — never hand-copy from a migration file) plus `audit_created`/`audit_completed`.
- Applied directly to production Supabase (`yxkgdalkbrriasiyyrwk`), verified live via a manual insert matching the exact corrected shape (succeeded, then deleted as part of test cleanup).

## Decisions
- Fixed via direct git hotfix, same worktree/pattern as the morning's fixes.
- Test audit created against Test RTO A (tenant 7517) via the real UI (Carl logged in as Super Admin), title prefixed `TEST — Claude QA sweep — DELETE ME` for unambiguous identification; fully deleted afterward — confirmed all `client_audits` foreign keys either `ON DELETE CASCADE` (sections, responses, findings, actions, documents) or `ON DELETE SET NULL` (portal_documents, stage_instances.linked_audit_id, evidence_requests), so a single delete cleanly restores the tenant's CHC stage state with nothing dangling.
- Did not pull the stale shared checkout at the repo root — flagged to Carl instead, since another tool had an unrelated uncommitted change there and it's the directory backing his live dev-server session.

## Open questions parked
- Whether to pull the shared checkout at the repo root (20+ commits behind `origin/main` as of this morning) — Carl's call, since his browser session is live against it.
- Whether the legacy `compliance_audits` system should be decommissioned outright, given zero rows ever and a known score-formula inconsistency with the current system.
- The RLS-only authorization question on `draft-finding`/`analyse-evidence`/`record-finding-decision` — needs someone to actually read the backing policies before calling it a gap.

## Tag
audit-2026-08-11-audit-feature-review
