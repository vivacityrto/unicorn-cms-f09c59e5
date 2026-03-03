

## Client Portal Phase 2 -- Implementation Plan

This is a large specification. It maps onto the existing codebase which already has foundational pieces from Sprint 1 (Tasks tab, Communications tab, Notifications badge, Tenant logo). This plan focuses on what is **new or needs enhancement** across 3 sprints.

---

### What Already Exists (No Rebuild Needed)

| Feature | Status | Location |
|---------|--------|----------|
| Tasks tab + unified query | Done | `ClientTasksPage.tsx`, `useClientAllTasks.ts` |
| Communications tab (threaded) | Done | `ClientCommunicationsPage.tsx`, `useClientCommunications.ts` |
| Notification bell (red dot + badge) | Done | `ClientTopbar.tsx` using `useClientNotifications` |
| Tenant logo in topbar | Done | `ClientTenantContext.tsx` exposes `logoUrl`, rendered in `ClientTopbar` |
| Phase progress view | Done | `usePhaseProgress.ts`, `v_phase_progress_summary` view |
| Phase gate RPC | Done | `fn_check_phase_gate` exists in DB |
| Progress summary + risk badge | Done | `ClientProgressSummary.tsx`, `useClientProgress.ts` |
| Compliance score ring | Done | `ComplianceScoreRing` component |
| Progress anchors | Done | `ProgressAnchors.tsx` on client home |
| Audit logging pattern | Done | `client_audit_log` used consistently across 16+ files |
| Sidebar with all tabs | Done | Tasks, Communications, Documents, Files, Calendar, etc. |

---

### Sprint 1: Tasks Enhancement + Dashboard Intelligence

#### 1A. Tasks Module Enhancements

The current Tasks page shows a flat table. The spec requires:
- **Priority column** -- add to the table
- **Attachment required flag** -- show icon when task requires evidence
- **Bulk actions** -- "Mark complete" and "Upload evidence" for selected tasks
- **Audit logging on status change** -- insert `client_audit_log` entry
- **Phase gate evaluation** -- after task completion, call `fn_check_phase_gate` if it was the last task in a phase

**Files to modify:**
- `src/pages/ClientTasksPage.tsx` -- Add priority column, attachment flag, checkbox selection, bulk action bar
- `src/hooks/useClientAllTasks.ts` -- Add `priority` and `attachment_required` fields to the query; add `updateTaskStatus` mutation with audit log insert + phase gate check

#### 1B. "What Needs Attention" Panel (Home Dashboard)

Replace the static "Upcoming reminders" and "Unread notifications" cards with a dynamic attention panel.

**Data sources:**
- `useClientAllTasks` -- overdue + due soon counts
- `useClientNotifications` -- unread count
- `usePhaseProgress` -- locked phase warnings
- `useClientProgress` -- risk state

**New component:** `src/components/client/AttentionPanel.tsx`
- Shows dynamic list: overdue tasks, due soon tasks, new messages, phase locked warnings, risk alerts
- Each item is clickable (links to relevant page)
- Red/amber/green severity colouring

**Modify:** `src/components/client/ClientHomePage.tsx`
- Replace the "Upcoming reminders" and "Unread notifications" cards (lines 105-133) with `<AttentionPanel />`

#### 1C. Audit Readiness Indicator

Add to the home dashboard below the progress summary.

**Calculation:** `(completed_required_stages / required_stages) * 100` -- already available from `v_phase_progress_summary`

**New component:** `src/components/client/AuditReadinessCard.tsx`
- Shows percentage, missing evidence count, last review date
- Uses data already fetched by `useClientProgress`

**Modify:** `src/components/client/ClientHomePage.tsx` -- Add `<AuditReadinessCard />` section

#### 1D. Activity Timeline

**New hook:** `src/hooks/useClientActivityTimeline.ts`
- Query `client_audit_log` for the active tenant, last 10 entries
- Filter to material actions: task completions, document uploads, stage releases, status changes

**New component:** `src/components/client/ActivityTimeline.tsx`
- Icon + description + timestamp for each entry
- Categorised by action type with appropriate icons

**Modify:** `src/components/client/ClientHomePage.tsx` -- Add timeline section after attention panel

---

### Sprint 2: Packages View + Phase Gates + Compliance Pulse

#### 2A. Client Packages Page

Add a new `/client/packages` route showing a read-only package view for clients.

**Display structure:** Package > Phases > Stages > Tasks > Documents (accordion/tree)

**New files:**
- `src/pages/client/ClientPackagesWrapper.tsx` -- Wrapper with ClientLayout
- `src/pages/ClientPackagesPage.tsx` -- Read-only package viewer

**Uses existing hooks:**
- `useClientPackageInstances` -- fetches package instances
- `usePhaseProgress` -- phase grouping and status
- `fn_check_phase_gate` -- gate status per phase

**Phase gate UI:**
- GREEN phase = open (green badge)
- AMBER = soft gate, warning shown
- RED/HARD = locked, subsequent phases greyed out with reason from gate RPC
- Hard stop banner when gate blocks progression

**Modify:**
- `src/components/client/ClientSidebar.tsx` -- Add "Packages" item (Package2 icon) between Tasks and Documents
- `src/App.tsx` -- Add `/client/packages` route

#### 2B. Compliance Pulse Banner

Persistent top banner on the client portal showing:
- Current overall risk level (from `useClientProgress` risk_state)
- Phase position (current phase name)
- Submission eligibility (all phases GREEN + risk LOW)
- Days since last client activity (from `client_audit_log`)

**New component:** `src/components/client/CompliancePulseBanner.tsx`

**Modify:** `src/components/layout/ClientLayout.tsx` -- Add banner below topbar, above main content

#### 2C. Risk and Gate Overlay

Surface risk indicators when risk is HIGH:
- Red banner on affected package cards
- Disable submission button
- Show: "Submission blocked", financial expiry warning, mock audit risk

**Modify:**
- `src/components/client/ClientProgressSummary.tsx` -- Add hard stop banner when `risk_state === 'action_required'`
- `src/pages/ClientPackagesPage.tsx` -- Gate overlay on locked phases

---

### Sprint 3: Document Acknowledgement + Role Enforcement + Automation Prep

#### 3A. Document Acknowledgement Tracking

**Database migration:** Create `document_acknowledgements` table

```text
document_acknowledgements
- id (uuid, PK)
- document_instance_id (bigint, FK to portal_documents or governance_document_deliveries)
- tenant_id (integer, FK to tenants)
- user_id (uuid, FK to auth.users)
- acknowledged_at (timestamptz, default now())
- UNIQUE (document_instance_id, user_id)
```

RLS: tenant members can insert their own acknowledgements (user_id = auth.uid()), select within tenant.

**UI changes:**
- Add "Acknowledge" button on shared documents that require acknowledgement
- Show acknowledgement status (who acknowledged, when) in document list

**Files:**
- Migration SQL
- `src/components/client/ClientDocumentsPage.tsx` -- Add acknowledge button + status indicator
- `src/hooks/useDocumentAcknowledgements.ts` -- New hook for insert + query

#### 3B. Role-Specific View Enforcement

The spec defines Admin/User/Viewer roles on the tenant side. The existing system uses `parent`/`child` roles in `tenant_users`.

**Mapping:**
- `parent` = Admin (full task control, upload, manage users)
- `child` = User (assigned tasks only)
- Preview mode = Viewer (read-only, already enforced by `isReadOnly`)

**Implementation:**
- `src/hooks/useClientAllTasks.ts` -- For `child` role users, filter tasks to `assigned_user_id = auth.uid()` only
- `src/pages/ClientTasksPage.tsx` -- Hide bulk actions for `child` users
- `src/components/client/ClientSidebar.tsx` -- Hide "Team" link for `child` users

**No new RLS needed** -- existing RLS on `client_task_instances` already scopes by tenant membership.

#### 3C. Structured Signal Collection (Phase 3 AI Prep)

Ensure `client_audit_log` entries contain structured `details` JSON for future AI consumption:

- Task completion latency (time between assignment and completion)
- Document upload delay (time between share and upload)
- Phase exception reasons (already captured in `phase_instances.exception_reason`)
- Communication gaps (time between messages)

**Modify:** Audit log inserts across task and document hooks to include computed latency fields in the `details` JSONB column. No schema change needed -- `details` column already exists as JSONB.

---

### Sidebar Update (Final Structure)

```text
Home
Tasks
Packages    <-- NEW
Documents
Files
Resource Hub
Calendar
Notifications
Communications
Reports
Team
TGA Details
```

---

### Files Summary

| Sprint | New Files | Modified Files | Migrations |
|--------|-----------|----------------|------------|
| 1 | 3 (AttentionPanel, AuditReadinessCard, ActivityTimeline + hook) | 3 (ClientHomePage, ClientTasksPage, useClientAllTasks) | 0 |
| 2 | 3 (ClientPackagesPage, ClientPackagesWrapper, CompliancePulseBanner) | 4 (ClientSidebar, ClientLayout, ClientProgressSummary, App.tsx) | 0 |
| 3 | 1 (useDocumentAcknowledgements) | 3 (ClientDocumentsPage, ClientTasksPage, audit hooks) | 1 (document_acknowledgements table) |

### Architectural Guardrails Enforced

- All queries scoped by `activeTenantId` from `ClientTenantContext`
- RLS on all new tables (document_acknowledgements)
- No frontend-only permissions -- role checks via `tenant_users` role column
- Audit log on every material action
- Phase gate evaluation via `fn_check_phase_gate` RPC (server-side logic)
- No service role in browser
- Notification creation server-side only (existing `user_notifications` pattern)

### Recommended Sequence

Start with Sprint 1 (highest visibility: dashboard intelligence + task enhancements), then Sprint 2 (packages + compliance pulse), then Sprint 3 (acknowledgements + role hardening + AI signal prep).

