

## Audits & Assessments Module — Shell Build

### Summary
Build the new client audits module across 4 areas: a team dashboard at `/audits` (replacing the existing template-based page), a new "Audits" tab in the client detail page, a multi-step "New Audit" modal, and a placeholder workspace at `/audits/:id`.

### Technical Details

**Existing state**: The route `/audits` already exists and renders `src/pages/Audits.tsx` (a template/inspection manager). The sidebar has no "Audits" entry in the WORK section. The DB tables `client_audits`, `client_audit_sections`, `client_audit_responses`, `client_audit_findings`, `client_audit_actions`, `client_audit_documents`, and view `v_client_audits_dashboard` all exist with the exact columns specified.

**No database migrations needed** — all tables and the dashboard view already exist.

---

### Files to Create

1. **`src/types/clientAudits.ts`** — TypeScript types: `AuditType`, `AuditStatus`, `AuditRisk`, `AuditAiStatus`, `ClientAudit`, `AuditDashboardRow` as specified in the prompt.

2. **`src/hooks/useClientAudits.ts`** — React Query hooks:
   - `useAuditsDashboard()` — fetches all rows from `v_client_audits_dashboard`, ordered by `updated_at DESC`
   - `useClientAudits(tenantId)` — same view filtered by `subject_tenant_id`
   - `useCreateAudit()` — mutation to INSERT into `client_audits` + INSERT timeline event into `client_timeline_events`
   - `useAudit(auditId)` — fetches single row from `client_audits` by id

3. **`src/pages/AuditsAssessments.tsx`** — The new team dashboard page:
   - Header with title "Audits & Assessments" and "New Audit" button
   - 4 stat cards: Total Audits, Active Audits, Completed This Year, Overdue Actions
   - Filter bar: search, audit type multi-select, status select, lead auditor select, clear filters
   - Table with columns: Client (name + RTO), Audit Type badge, Status badge, Risk badge, Lead Auditor (avatar + name), Conducted date, Next Due (red if past), Findings count, Open Actions count (orange if >0), Open button
   - Empty state with illustration text
   - Each row clickable → `/audits/:id`

4. **`src/components/audit/NewAuditModal.tsx`** — Multi-step modal (3 steps):
   - Step 1: Select type (3 large cards — CHC, Mock Audit, Due Diligence)
   - Step 2: Client & details (client dropdown, title, date, lead/assisted auditors, training products tags, doc number). If `preselectedTenantId` prop set, lock client field.
   - Step 3: Snapshot client details — auto-fetch from `tenant_profile` joined with `tenants`, pre-fill snapshot fields, editable
   - Save: INSERT into `client_audits` with `status='draft'`, auto-generate title if blank, INSERT timeline event, navigate to `/audits/{id}`

5. **`src/components/audit/AuditTypeBadge.tsx`** — Badge component for audit type (CHC=Blue, Mock=Purple, Due Diligence=Amber)

6. **`src/components/audit/AuditStatusBadge.tsx`** — Badge component for status (draft=Grey, in_progress=Blue, review=Amber, complete=Green, archived=Grey muted)

7. **`src/components/audit/AuditRiskBadge.tsx`** — Badge component for risk rating (low=Green, medium=Amber, high=Orange, critical=Red)

8. **`src/components/client/ClientAuditsTab.tsx`** — Audits tab for client detail page:
   - Header with "Audits & Assessments" title and "Start New Audit" button (opens modal with pre-selected client)
   - Card-based audit list (not table) filtered by `subject_tenant_id`
   - Each card: type/status/risk badges, title, lead auditor + findings + open actions, next due date
   - Empty state
   - Audit history summary timeline for completed audits (date, type, risk, score, lead)

9. **`src/pages/AuditWorkspacePlaceholder.tsx`** — Placeholder page at `/audits/:id`:
   - Back link, audit title, client name, type/status badges
   - "Audit workspace coming soon" message
   - 4 stat tiles (all zero for new audits)

### Files to Modify

10. **`src/components/DashboardLayout.tsx`**:
    - Add `{ icon: ClipboardCheck, label: "Audits", path: "/audits" }` to `clientsMenuItems` array (after Compliance Auditor or as appropriate in the CLIENTS section)
    - Import `ClipboardCheck` from lucide-react (already imported)

11. **`src/App.tsx`**:
    - Replace the existing `/audits` route to render `AuditsAssessments` instead of `Audits`
    - Replace `/audits/:id` route to render `AuditWorkspacePlaceholder` instead of `AuditWorkspace`
    - Add lazy imports for the new pages
    - Keep existing `/audits/create-template`, `/audits/:id/findings`, `/audits/:id/actions`, `/audits/:id/report` routes intact

12. **`src/pages/ClientDetail.tsx`**:
    - Import `ClientAuditsTab` and `ClipboardCheck` icon
    - Add "Audits" tab trigger between "Actions" and "Emails" tabs, with active audit count badge
    - Add `TabsContent` for "audits" value rendering `ClientAuditsTab`
    - Query active audit count for the badge using a lightweight count query

### Badge Color Specifications
- **Audit Type**: CHC → `info` variant (blue), Mock Audit → `default` variant (purple), Due Diligence → `warning` variant (amber)
- **Status**: draft → `outline`, in_progress → `info`, review → `warning`, complete → `default` (green/success style), archived → `secondary`
- **Risk**: low → green, medium → amber, high → orange, critical → red (inline styles matching `RiskLevelBadge` pattern)

### Data Flow
- Dashboard queries `v_client_audits_dashboard` (denormalized view with all needed joins)
- New Audit modal queries `tenants` for client dropdown, `tenant_profile` for snapshot, `users` for auditor dropdowns (filtered by `is_vivacity_internal = true` or `unicorn_role IN (...)`)
- Create mutation inserts into `client_audits` then `client_timeline_events`
- Client tab reuses same view filtered by tenant

