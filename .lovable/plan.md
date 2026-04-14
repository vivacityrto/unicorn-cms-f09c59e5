

## Audit Preparation Portal, Scheduler & Digital Action Plan

### Summary
Three features closing the audit lifecycle loop: (1) Evidence requests from the audit workspace + client upload portal, (2) Scheduler showing overdue/upcoming CHCs on dashboard and client folders, (3) Auto-sync of findings to client action items on audit completion.

---

### Feature 1 — Audit Preparation Portal

#### 1A: Auditor side (audit workspace Overview tab)

**New file: `src/components/audit/workspace/EvidenceRequestsSection.tsx`**
- Renders below the Client Snapshot card in OverviewTab
- Header: "Evidence Requests" + "+ Send Evidence Request" button
- Lists existing `evidence_requests` where `audit_id = auditId` using the existing `useEvidenceRequests` hook (filtered by audit_id)
- Each request card: title, sent date, due date, status badge, item progress bar
- Expandable item list: name, required badge, status, file download, Accept/Request Revision buttons

**New file: `src/components/audit/workspace/SendEvidenceRequestDrawer.tsx`**
- Drawer with: title, due date (default 14 days), intro message, dynamic item list
- "Generate from audit questions" button: queries `compliance_template_questions` for this audit's template, creates items from `evidence_to_sight` fields
- Each item: document name, guidance text, required toggle, section dropdown
- Save: INSERT `evidence_requests` with `audit_id`, then INSERT `evidence_request_items` with `section_id`

**New hook: `src/hooks/useAuditPrep.ts`**
- `useAuditEvidenceRequests(auditId)` — fetches evidence_requests where audit_id matches, with nested items
- `useCreateAuditEvidenceRequest()` — inserts request + items with audit_id set
- `useGenerateRequestFromQuestions(auditId)` — loads template questions with evidence_to_sight, returns pre-filled items
- `useReviewEvidenceItem()` — updates status, review_notes, reviewed_at, reviewed_by on evidence_request_items

**Modify: `src/components/audit/workspace/OverviewTab.tsx`**
- Import and render `EvidenceRequestsSection` below the Client Snapshot card, passing `audit`

#### 1B: Client side — Preparation Portal

**New file: `src/components/client/AuditPreparationSection.tsx`**
- Section shown on ClientHomePage when evidence_requests with `audit_id IS NOT NULL` exist for this tenant
- Header: "Prepare for your upcoming audit"
- For each active request: card with title, due date, progress bar, consultant name
- Per item: document name, guidance, required badge, status, upload button
- Upload: file to `portal-documents` bucket at `{tenant_id}/audit/{request_id}/{item_id}/{filename}`
- INSERT portal_documents + UPDATE evidence_request_items with received_document_id and status
- Revision requested: amber panel with review_notes + re-upload
- Accepted: green tick

**New hook additions in `src/hooks/useAuditPrep.ts`**
- `useClientEvidenceRequests(tenantId)` — fetches evidence_requests where audit_id IS NOT NULL for client portal
- `useUploadEvidenceItem()` — uploads to storage + creates portal_documents + updates evidence_request_items

**Modify: `src/components/client/ClientHomePage.tsx`**
- Import and conditionally render `AuditPreparationSection` below the progress anchors

---

### Feature 2 — Audit Scheduler

**New hook: `src/hooks/useAuditScheduler.ts`**
- `useAuditSchedule(filter?)` — queries `v_audit_schedule` view, ordered by `days_until_due`
- `useClientAuditSchedule(tenantId)` — single client's schedule row

**New file: `src/components/audit/AuditSchedulerSection.tsx`**
- Collapsible section for `/audits` dashboard
- Stat pills: overdue (red), due within 90 days (amber), never audited (grey)
- Table: Client, RTO ID, Risk, Last CHC, Last Score, Next Due, Status badge, "Start CHC" button
- "Start CHC" opens NewAuditModal pre-filled with client + `compliance_health_check` type
- Expanded by default if any overdue

**Modify: `src/pages/AuditsAssessments.tsx`**
- Import and render `AuditSchedulerSection` between the audits table and the Reference Library

**New file: `src/components/client/AuditScheduleAlert.tsx`**
- Banner component for client folder: overdue (amber), due soon (yellow), never audited (info)
- "Start CHC" button opens NewAuditModal pre-filled

**Modify: `src/components/client/ClientAuditsTab.tsx`** (or parent `ClientDetail.tsx`)
- Import and render `AuditScheduleAlert` above the audits list

---

### Feature 3 — Digital Action Plan

#### 3A: Auto-sync on audit completion

**Modify: `src/hooks/useAuditWorkspace.ts` — `useAuditStatusTransition`**
- After status = 'complete' update succeeds, call `supabase.rpc('sync_audit_actions_to_client_items', { p_audit_id: auditId })`
- Return the sync count in the success toast: "{N} corrective actions added to client action plan"

#### 3B: Actions tab sync status

**Modify: `src/components/audit/workspace/ActionsTab.tsx`**
- When audit is complete: banner at top "This audit is complete. N actions synced to client action plan. [View in client folder →]"
- Per action card: if `client_action_item_id` is set → green "Synced" label; else grey "Not synced" + "Sync now" button

#### 3C: Client portal action plan

**New file: `src/components/client/ClientActionPlanSection.tsx`**
- Shows `client_action_items` where `source = 'audit'` and `status != 'completed'`
- Priority-ordered cards: priority badge, title, source audit name, due date, assignee
- "Mark as complete" → PATCH status = 'completed'
- "Upload evidence" → file picker → portal_documents with linked_task_id
- Summary stats: total open, overdue (red), due this month (amber)
- Empty state: "No outstanding actions from your audits."

**New hook: `src/hooks/useAuditActionPlan.ts`**
- `useClientActionPlan(tenantId)` — fetches client_action_items where source = 'audit'
- `useCompleteClientAction()` — PATCH status + completed_at + completed_by
- `useSyncAuditActions(auditId)` — calls the RPC

**Modify: `src/components/client/ClientHomePage.tsx`**
- Import and render `ClientActionPlanSection` below the Audit Preparation section

---

### NewAuditModal prefill for Scheduler

**Modify: `src/components/audit/NewAuditModal.tsx`**
- Add optional `preselectedAuditType?: AuditType` prop
- When set, skip Step 1 and lock audit type

---

### Technical Notes
- `evidence_requests` table already has `audit_id` column (uuid, nullable)
- `evidence_request_items` already has `section_id` and `question_id` columns
- `v_audit_schedule` view exists with columns: tenant_id, client_name, rto_id, client_risk_level, last_conducted_at, last_score_pct, next_due_date, schedule_status, days_until_due, etc.
- `sync_audit_actions_to_client_items` RPC exists, takes `p_audit_id: string`, returns number
- `client_action_items` table has `source` text column for filtering audit-sourced items
- No database migrations required — all tables, views, and RPCs already exist
- All Supabase queries use `as any` cast pattern consistent with codebase

### Files Summary

| Action | File |
|--------|------|
| Create | `src/hooks/useAuditPrep.ts` |
| Create | `src/hooks/useAuditScheduler.ts` |
| Create | `src/hooks/useAuditActionPlan.ts` |
| Create | `src/components/audit/workspace/EvidenceRequestsSection.tsx` |
| Create | `src/components/audit/workspace/SendEvidenceRequestDrawer.tsx` |
| Create | `src/components/audit/AuditSchedulerSection.tsx` |
| Create | `src/components/client/AuditPreparationSection.tsx` |
| Create | `src/components/client/AuditScheduleAlert.tsx` |
| Create | `src/components/client/ClientActionPlanSection.tsx` |
| Modify | `src/components/audit/workspace/OverviewTab.tsx` |
| Modify | `src/components/audit/workspace/ActionsTab.tsx` |
| Modify | `src/components/audit/NewAuditModal.tsx` |
| Modify | `src/pages/AuditsAssessments.tsx` |
| Modify | `src/components/client/ClientAuditsTab.tsx` |
| Modify | `src/components/client/ClientHomePage.tsx` |
| Modify | `src/hooks/useAuditWorkspace.ts` |

