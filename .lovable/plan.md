## Audit Form: Prominent Raise Finding Button + Accurate Progress

Strictly additive. New views, new hook, UI rebinding, redesigned Raise Finding affordance, soft guard on Generate Report.

### Database (applied)
- `v_client_audit_response_completion` — per-response with `is_complete` and `completion_state`.
- `v_client_audit_section_completion` — per-section rollup with `section_state`.
- `v_client_audit_progress` — per-audit rollup powering the sidebar.
- All three views use `with (security_invoker = true)` so existing RLS on `client_audit_responses`, `client_audit_findings`, `client_audit_sections` is preserved. Verified counts on the Smart Education Due Diligence audit: 23/31 complete, 8 findings_required.

### Hooks
- `src/hooks/useAuditCompletion.ts` exports `useAuditProgress`, `useAuditSectionCompletion`, `useResponseCompletion`. Subscribes to react-query cache; auto-invalidates whenever responses or findings change for the same audit.

### UI
- **`AuditSidebar.tsx`** — progress block reads from `v_client_audit_progress`. Header is `{complete} of {total}`; sub-line composes `{n} complete · {n} need attention · {n} unanswered` (each fragment hidden when zero). Bar is green only at 100% true completion, amber otherwise. Section rows read from `v_client_audit_section_completion`: green dot for `complete`, amber dot + ⚠ glyph + tooltip for `rated_incomplete`, grey for `in_progress` and `empty`.
- **`DocumentReviewPhase.tsx`** — section header now reads `{complete} of {total} complete` and appends an amber `{n} finding(s) required` pill when applicable.
- **`QuestionCard.tsx`** — new state-aware button replaces the small ghost "+ Raise Finding" link. Hidden when no rating; outline `🚩 {n} finding(s)` for compliant/na with findings; destructive `⚠ Raise finding` (full-width on mobile, pulsed once for ~2s on first render after the rating change) for at_risk/non_compliant with no finding; outline `🚩 {n} · Add another` when at_risk/non_compliant already has findings. The amber in-card banner appears between notes and actions whenever a flagged response has zero findings. Both the banner and the action-row button toggle the same inline `AddFindingForm`. Toggling out of a flagged rating while findings exist shows a sonner toast with a "Review findings" action — findings are never auto-deleted.
- **`tailwind.config.ts`** — added one-shot `pulse-once` keyframe and `animate-pulse-once` class (runs twice over ~2s, then stops).
- **`ReportTab.tsx`** — Generate Report button is now active. When `findings_required + notes_required > 0` it opens an `AlertDialog` with the counts: **Review incomplete items** (default) or **Generate anyway**. When complete, it shows the existing "coming soon" notice (backend generation is still a separate follow-up).

### Out of scope (intentionally not built)
- Mark closing meeting complete: there is no such trigger in the live UI today, so nothing to guard.
- Legacy `AuditQuestionCard.tsx` and standalone `compliance-audit/QuestionCard.tsx` are not touched (different modules).
- AI suggestions, AI finding text, finding auto-delete on rating change, hard-blocking report generation.

### Files
- New: SQL migration creating the three views.
- New: `src/hooks/useAuditCompletion.ts`
- Edited: `tailwind.config.ts`, `src/components/audit/workspace/QuestionCard.tsx`, `src/components/audit/workspace/AuditSidebar.tsx`, `src/components/audit/workspace/DocumentReviewPhase.tsx`, `src/components/audit/workspace/ReportTab.tsx`
- Edited: `.lovable/plan.md`
