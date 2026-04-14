

## Compliance Auditor Module — Build Plan

### Context
All database tables already exist and are populated:
- `compliance_templates` — 1 active template (CRICOS National Code 2018)
- `compliance_template_sections` — 12 sections (Opening Meeting + Standards 1-11)
- `compliance_template_questions` — 61 questions with clause, audit_statement, response_set, evidence_to_sight, unicorn_documents, corrective_action fields
- `compliance_audits` — stores audits per tenant
- `compliance_audit_responses` — per-question responses with score, flagging, evidence
- `compliance_corrective_actions` — CAAs linked to responses
- RLS policies are already configured for all tables
- No storage bucket for `compliance-evidence` exists yet (needs creation)

### Database Changes (Migration)

1. **Create `compliance-evidence` storage bucket** — private bucket for evidence file uploads
2. **Add storage RLS policies** for authenticated users to upload/read evidence files scoped to their tenant

### New Pages & Components

#### Page A — Compliance Audit List (`/compliance-audits/:tenantId`)
- **Route**: Add to `App.tsx` as a protected SuperAdmin route
- **Header**: Tenant name (fetched from `tenants` table), "Start New Audit" button
- **Table**: Queries `compliance_audits` joined with `compliance_templates` and `users` for template name and auditor name
  - Columns: Audit date, Template name, Auditor, Status badge, Score %, Open CAAs count, Actions
  - Actions: Continue (draft/in_progress), View Report (complete), Archive
- **Start New Audit Modal**: Template dropdown (from `compliance_templates WHERE is_active`), date picker, auditor selector, notes textarea
  - On save: INSERT audit + bulk INSERT one `compliance_audit_responses` row per question with `response = null`

#### Page B — Compliance Audit Form (`/compliance-audits/:tenantId/audit/:auditId`)
- **Left sidebar**: Section navigator with progress per section (e.g. "3/5 answered"), green tick for complete, amber dot for flagged
- **Sticky header**: Tenant name, audit date, overall progress bar (X/61), live score %, status badge, "Complete Audit" button
- **Question cards**: Each renders based on `response_set`:
  - `safe_at_risk`: Two large toggle buttons (Safe = teal, At Risk = amber)
  - `compliant_non_compliant_na`: Three buttons (Compliant = teal, Non-Compliant = red, N/A = gray)
- **Collapsible guidance panel** per question: evidence_to_sight, unicorn_documents as pill badges, corrective_action text
- **Notes field**: Textarea, autosaves on blur
- **Evidence upload**: Upload to `compliance-evidence` bucket, stores URLs in `evidence_urls`
- **Flagged state**: When At Risk or Non-Compliant selected, show inline CAA form (description pre-filled from `corrective_action`, responsible person, due date, evidence required checkbox) — creates/updates `compliance_corrective_actions`
- **Autosave**: UPSERT to `compliance_audit_responses` on every change; recalculate `score_total`, `score_max`, `score_pct` on `compliance_audits`
- **Complete**: Validates all 61 responses filled, sets status = 'complete', navigates to report

#### Page C — Compliance Audit Report (`/compliance-audits/:tenantId/audit/:auditId/report`)
- **Report header**: Provider name, CRICOS code, audit date, auditor, template name, circular score gauge (color-coded)
- **Score summary table**: One row per section with Compliant/At Risk/Non-Compliant/N/A counts and section score
- **Findings by section**: Each question with response badge; flagged questions show CAA details
- **CAA Tracker table**: Clause, finding summary, responsible person, due date, status (inline editable dropdown), verified by
  - On close: prompt for verification name/date
- **Export PDF button**: Wired but placeholder (Edge Function is a separate build step)
- **Navigation**: "Back to Audit List" link; read-only banner if complete; "Edit Responses" if in_progress

### New Files
- `src/pages/ComplianceAuditList.tsx` — Page A
- `src/pages/ComplianceAuditForm.tsx` — Page B
- `src/pages/ComplianceAuditReport.tsx` — Page C
- `src/hooks/useComplianceAudits.tsx` — Data hooks for CRUD, score calculation, autosave
- `src/components/compliance-audit/SectionNav.tsx` — Left sidebar section navigator
- `src/components/compliance-audit/QuestionCard.tsx` — Question card with response toggles, guidance, notes, evidence, CAA
- `src/components/compliance-audit/ScoreGauge.tsx` — Circular score gauge component
- `src/components/compliance-audit/CAATracker.tsx` — Corrective actions table with inline editing

### Modified Files
- `src/App.tsx` — Add 3 new routes
- `src/components/DashboardLayout.tsx` — Add nav item for Compliance Auditor (SuperAdmin section)

### Security
- All queries are tenant-scoped via existing RLS policies
- Only Vivacity staff / SuperAdmins can create and manage audits (enforced by RLS)
- Storage bucket policies will scope file access to tenant members

