

## Enhanced Audit Action Plan & Report Release

### Summary
Four connected features: (1) Rich action drawer in audit workspace, (2) Report release workflow in Report tab, (3) Client portal audit report section, (4) Enhanced client action plan with response/verification workflow. All DB infrastructure (columns, views, RPCs) already exists.

---

### Feature 1 — Enhanced Actions Tab

**Update `src/types/auditWorkspace.ts`**
- Add `ActionType`, `DeliveryModel`, `VerificationStatus` types
- Expand `AuditAction` interface with all new columns (action_type, delivery_model, standard_reference, labels, evidence_required, client_notes, internal_notes, client_response, verification_status, verified_by/at, evidence_document_ids, extended_due_date, extension_reason)
- Add `AuditActionPlanItem` interface extending `AuditAction` with view columns (subject_tenant_id, audit_title, assigned_to_name, finding_summary, is_overdue, effective_due_date, days_remaining)
- Add constants: `ACTION_TYPE_OPTIONS`, `DELIVERY_MODEL_OPTIONS`, `VERIFICATION_STATUS_OPTIONS`

**Create `src/components/audit/workspace/ActionDrawer.tsx`**
- Full-featured drawer with 5 sections: Identity (type segmented selector, title, standard_reference, labels), Delivery (radio cards), Client-facing (client_notes textarea, due date, priority, evidence toggle), Internal notes (collapsible), Finding link (read-only panel if linked)
- Used for both create and edit modes
- Pre-fills from finding when opened via "Raise Action"

**Create `src/components/audit/workspace/VerificationDrawer.tsx`**
- Shows client response text + uploaded evidence docs with download links
- Three action buttons: Verified, Request Resubmission, Waive
- Verification notes textarea
- PATCHes verification_status + verified_by/at/notes + status

**Rewrite `src/components/audit/workspace/ActionsTab.tsx`**
- Replace inline AddActionForm with ActionDrawer
- Add filter bar: delivery model, action type, verification status
- Add stats: awaiting verification, client self, vivacity-assisted
- Redesigned action cards showing: action_type badge with icon/color, delivery model badge, standard_reference, client_notes preview, labels, verification status, Edit/Verify/Waive buttons
- Internal notes collapsible (Vivacity staff only)

**Update `src/hooks/useAuditWorkspace.ts`** — `useAuditActions`
- Query includes all new columns (still from `client_audit_actions`)
- `createAction` accepts full payload with new fields
- Add `useVerifyAction` mutation

---

### Feature 2 — Report Release (Report Tab)

**Update `src/components/audit/workspace/ReportTab.tsx`**
- Add "Release to Client" section below report preview, separated by divider
- Unreleased state: message textarea + warning about visibility + "Release Report to Client" button
- Released state: green banner with releaser name/date, acknowledgement status
- "Revoke access" button (SuperAdmin only) — sets `report_client_visible = false`
- Confirm dialog before release

**Create `src/hooks/useAuditReport.ts`**
- `useReleaseReport(auditId)` — calls `release_audit_report` RPC
- `useAcknowledgeReport(auditId)` — calls `acknowledge_audit_report` RPC
- `useRevokeReport(auditId)` — PATCH `report_client_visible = false`

---

### Feature 3 — Client Portal: Audit Reports

**Create `src/components/client/ClientAuditReportsSection.tsx`**
- Queries `client_audits` where `report_client_visible = true` for tenant
- Report card: audit title, release date, conducted date, lead auditor, release notes message, risk rating, score, finding count
- "Download Report PDF" button (signed URL from storage)
- "View Action Plan" scrolls/navigates to action plan section
- "Acknowledge Report" checkbox + button → calls `acknowledge_audit_report` RPC
- Post-acknowledge: shows "Acknowledged on {date}"

**Create `src/hooks/useClientAuditPortal.ts`**
- `useClientAuditReports(tenantId)` — fetches visible audits
- `useClientActionPlanEnhanced(tenantId)` — queries `v_audit_action_plan` view

**Modify `src/components/client/ClientHomePage.tsx`**
- Import and render `ClientAuditReportsSection` between AuditPreparationSection and ClientActionPlanSection

---

### Feature 4 — Enhanced Client Action Plan

**Rewrite `src/components/client/ClientActionPlanSection.tsx`**
- Query `v_audit_action_plan` instead of `client_action_items`
- Action cards show: action_type badge, priority, standard_reference, `client_notes` (not description), delivery model context text, assigned consultant name
- Large response textarea saving to `client_response`
- Evidence upload to `portal-documents` at `{tenant_id}/audit-actions/{action_id}/{filename}`, inserting `portal_documents` with `linked_audit_action_id`
- "Submit response" → PATCHes client_response + verification_status = 'response_received' + status = 'in_progress'
- Verification status banners: verified (green), rejected (amber with resubmit), waived (grey)
- Observation type: informational only, no response required
- Filter out cancelled actions and observation types from counts

**Update `src/hooks/useAuditActionPlan.ts`**
- `useClientActionPlan` → query `v_audit_action_plan` filtered by `subject_tenant_id` and `report_client_visible = true`
- `useClientSubmitActionResponse()` — PATCH client_response fields + verification_status
- `useUploadActionEvidence()` — upload + insert portal_documents + append to evidence_document_ids
- Keep `useSyncAuditActions` and `useCompleteClientAction`

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/auditWorkspace.ts` |
| Create | `src/components/audit/workspace/ActionDrawer.tsx` |
| Create | `src/components/audit/workspace/VerificationDrawer.tsx` |
| Rewrite | `src/components/audit/workspace/ActionsTab.tsx` |
| Modify | `src/components/audit/workspace/ReportTab.tsx` |
| Create | `src/hooks/useAuditReport.ts` |
| Create | `src/components/client/ClientAuditReportsSection.tsx` |
| Create | `src/hooks/useClientAuditPortal.ts` |
| Rewrite | `src/components/client/ClientActionPlanSection.tsx` |
| Modify | `src/hooks/useAuditActionPlan.ts` |
| Modify | `src/hooks/useAuditWorkspace.ts` |
| Modify | `src/components/client/ClientHomePage.tsx` |

No database migrations required — all columns, views, and RPCs already exist.

