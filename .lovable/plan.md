

## Full Audit Workspace — Implementation Plan

### Summary
Replace the placeholder at `/audits/:id` with a full two-column audit workspace containing 6 tabs: Overview, Audit Form, Documents, Findings, Actions, and Report. No new database migrations needed — all tables exist.

### Scope Note
The `analyze-document` edge function currently handles document categorization (not compliance audit analysis). The `generate-audit-report` edge function does not exist yet. For this build, we will wire the UI for both but handle the missing edge function gracefully (show "coming soon" for report generation, and stub the AI document analysis call).

---

### Technical Details

**No database migrations required.** All tables (`client_audits`, `client_audit_sections`, `client_audit_responses`, `client_audit_findings`, `client_audit_actions`, `client_audit_documents`) and columns (`executive_summary`, `overall_finding`, `template_id`, `report_generated_at`, `report_pdf_path`, `report_prepared_by_id`, `score_total`, `score_max`, `closed_at`) already exist.

**Storage bucket:** Need to create `audit-documents` bucket if it doesn't exist — will check and create via migration if needed.

---

### Files to Create (~12 new files)

**1. `src/types/auditWorkspace.ts`** — Extended types for the workspace (AuditSection, AuditResponse, AuditFinding, AuditAction, AuditDocument, AiFinding, AiRecommendation, TemplateQuestion interfaces).

**2. `src/hooks/useAuditWorkspace.ts`** — All workspace data hooks:
- `useAuditSections(auditId)` — fetch/initialize sections from template or standards_reference
- `useAuditQuestions(sectionId)` — fetch compliance_template_questions for a section
- `useAuditResponses(auditId)` — fetch all responses + `upsertResponse` mutation
- `useAuditFindings(auditId)` — CRUD for findings
- `useAuditActions(auditId)` — CRUD for actions
- `useAuditDocuments(auditId)` — fetch + upload + polling for AI status
- `useAuditScore(auditId, responses, questions)` — derived score with debounced PATCH
- `useUpdateAudit(auditId)` — PATCH metadata fields on blur
- `useAuditStatusTransition(auditId)` — status workflow with timeline events

**3. `src/pages/AuditWorkspace.tsx`** — Main page replacing `AuditWorkspacePlaceholder`:
- Two-column layout: 280px sticky sidebar + scrollable content
- Sidebar: audit identity, progress bar, section nav, risk/score footer, status controls
- Content: 6-tab interface (Overview, Audit Form, Documents, Findings, Actions, Report)
- Responsive: sidebar collapses to top bar on <1024px

**4. `src/components/audit/workspace/AuditSidebar.tsx`** — Left sidebar component:
- Audit type/status badges, client name, RTO number
- Lead auditor display
- Overall progress bar (% questions answered, color-coded)
- Scrollable section nav with completion indicators (green/amber/grey dots)
- Footer: risk badge, score %, "Generate Report" button, status dropdown

**5. `src/components/audit/workspace/OverviewTab.tsx`** — Tab 1:
- Two-column editable grid (title, doc number, dates, auditor selectors)
- Training products tag input (CHC/Mock only)
- Client snapshot read-only summary + "Edit snapshot" toggle
- Risk rating selector, score display
- Executive summary + overall finding textareas
- All fields auto-save on blur via `useUpdateAudit`

**6. `src/components/audit/workspace/AuditFormTab.tsx`** — Tab 2 (core):
- Section initialization logic (template-driven vs freeform/SRTO 2025)
- Collapsible sections with completion counts
- Question cards with rating pills, notes textarea, add finding/attach evidence buttons
- Flagged response handling (amber corrective action panel)
- AI pre-fill suggestion display (accept/modify/dismiss)
- Freeform mode: placeholder text + manual finding list

**7. `src/components/audit/workspace/QuestionCard.tsx`** — Individual question rendering:
- Clause + nc_map header
- Audit statement text
- Collapsible evidence_to_sight
- Rating pill buttons (dynamic based on response_set)
- Debounced notes auto-save
- Inline add finding form
- Evidence attachment

**8. `src/components/audit/workspace/DocumentsTab.tsx`** — Tab 3:
- Drag-and-drop upload zone
- Document type selector on upload
- Document cards with AI status display
- Expandable AI findings/recommendations with "Add as Finding"/"Add as Action" buttons
- Polling for processing documents

**9. `src/components/audit/workspace/FindingsTab.tsx`** — Tab 4:
- Filter bar (priority + AI/manual)
- Findings grouped by priority (Critical → Low)
- Create/edit/delete actions
- Finding count badge

**10. `src/components/audit/workspace/ActionsTab.tsx`** — Tab 5:
- Stat row (Open/In Progress/Complete/Overdue)
- List view grouped by status
- Inline status dropdown changes
- Add Action drawer with finding linking

**11. `src/components/audit/workspace/ReportTab.tsx`** — Tab 6:
- Generate Report button (calls edge function or shows "coming soon" if not available)
- Report preview (executive summary, overall finding, risk, score, finding/action counts)
- Download PDF link

**12. `src/components/audit/workspace/AddFindingForm.tsx`** — Reusable inline finding form

### Files to Modify

**13. `src/App.tsx`** — Change `/audits/:id` route from `AuditWorkspacePlaceholder` to the new `AuditWorkspace` (lazy import)

**14. `src/types/clientAudits.ts`** — Add `template_id`, `executive_summary`, `overall_finding`, `report_generated_at`, `report_pdf_path`, `report_prepared_by_id`, `score_total`, `score_max`, `closed_at` to `ClientAudit` interface

### Implementation Order
1. Types + hooks (foundation)
2. AuditSidebar + main AuditWorkspace layout
3. OverviewTab (simplest tab)
4. AuditFormTab + QuestionCard (most complex — core of the workspace)
5. FindingsTab + AddFindingForm
6. ActionsTab
7. DocumentsTab (AI integration)
8. ReportTab
9. Wire route in App.tsx

### Key Design Decisions
- All Supabase queries use `as any` cast pattern (consistent with existing codebase)
- Auto-save on blur for metadata, debounced 500ms for notes
- Section initialization happens on first render of Audit Form tab (not on audit creation)
- Score calculation runs client-side after each response, debounced 1s PATCH to server
- Storage bucket `audit-documents` — will create via migration if missing
- The `generate-audit-report` edge function does not exist — Report tab will show "Generate Report" as disabled with a "Coming soon" note until the function is built
- The existing `analyze-document` function is for document categorization, not audit analysis — Documents tab will call it but display results generically

