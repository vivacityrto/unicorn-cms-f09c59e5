

## Audit Three-Phase Workflow Redesign

### Summary
Replace the flat section list in the Audit Form tab with a three-phase workflow (Opening Meeting → Document Review → Closing Meeting), with phase-appropriate question card styles. Redesign the sidebar to group sections by phase.

### Phase Data
- Opening Meeting: 1 section, 4 questions (`client_discussion`)
- Document Review: 17 sections, 100 questions (`auditor_assessment`)
- Closing Meeting: 1 section, 5 questions (`closing_discussion`)
- DB columns `audit_phase`, `section_summary`, `risk_level` already exist on `client_audit_sections`

### Files to Modify

**1. `src/types/auditWorkspace.ts`** — Add `AuditPhase`, `QuestionContext` types. Add `audit_phase` to `AuditSection`. Add `question_context` to `TemplateQuestion`. Add closing-meeting rating options constant.

**2. `src/components/audit/workspace/AuditFormTab.tsx`** — Full rewrite of template rendering:
- Fetch sections grouped by `audit_phase` into 3 phases
- Render horizontal phase stepper at top (with completion checkmarks)
- Phase 1 (Opening Meeting): warm blue/purple tint, conversation-style cards, summary textarea
- Phase 2 (Document Review): clean, info banner about independent review, Outcome group headers with aggregate completion %, section risk selectors, section summary textareas
- Phase 3 (Closing Meeting): warm tint, findings summary panel at top, discussion-style cards, closing notes textarea
- Outcome grouping logic based on sort_order ranges from the section data

**3. `src/components/audit/workspace/QuestionCard.tsx`** — Add `questionContext` prop:
- `client_discussion`: notes field large/prominent above rating, label "Client response / notes:", no evidence disclosure, rating secondary
- `auditor_assessment`: evidence expanded by default, label "Auditor notes:", "Assessment:" label, tooltip helper text, flagged panel says "Finding guide" with "Raise Finding" button
- `closing_discussion`: relabel ratings to Acknowledged/Partially acknowledged/Disputed, "Client response:" label, large textarea

### New Files

**4. `src/components/audit/workspace/PhaseStepIndicator.tsx`** — Horizontal stepper showing 3 phases with completion state.

**5. `src/components/audit/workspace/OpeningMeetingPhase.tsx`** — Renders Phase 1 sections with conversation styling and summary field.

**6. `src/components/audit/workspace/DocumentReviewPhase.tsx`** — Renders Phase 2 with outcome group headers, info banner, section risk selectors, section summaries.

**7. `src/components/audit/workspace/ClosingMeetingPhase.tsx`** — Renders Phase 3 with findings summary panel, discussion cards, closing notes.

**8. `src/components/audit/workspace/AuditSidebar.tsx`** — Rewrite section nav to group by phase:
- Phase headers (non-clickable labels) with completion indicator
- Section items nested under each phase
- Progress bar counts only `document_review` questions
- Label: "X of Y evidence items assessed"

### Hooks Changes

**9. `src/hooks/useAuditWorkspace.ts`** — Add:
- `useUpdateSectionSummary(auditId)` — PATCH `section_summary` on `client_audit_sections`
- `useUpdateSectionRiskLevel(auditId)` — PATCH `risk_level` on `client_audit_sections`
- Ensure `useAuditQuestions` also fetches `question_context` from template questions

### No Database Migrations
All required columns (`audit_phase`, `section_summary`, `risk_level`, `question_context`) already exist.

### Key Design Details
- Outcome grouping derived from section titles (parse "Outcome N" prefix; fallback "Compliance requirements")
- Phase completion = all questions in that phase's sections have a rating
- Keep existing status workflow — phase indicators in sidebar show progress visually
- Document review progress bar excludes opening/closing meeting questions
- Section risk level selector: Low / Medium / High / Critical pills saving to `client_audit_sections.risk_level`

