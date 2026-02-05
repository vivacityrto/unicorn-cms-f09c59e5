# EOS Audit Report

**Generated:** 2026-02-05  
**Scope:** Unicorn 2.0 EOS System (Vivacity-Only)

---

## Executive Summary

This report documents the complete audit of the EOS (Entrepreneurial Operating System) module within Unicorn 2.0. EOS is restricted to Vivacity Team users only (Super Admin, Team Leader, Team Member) and is not accessible to client tenant users.

---

## 1. Database Schema Audit

### 1.1 EOS Core Tables

| Table | Primary Key | tenant_id Type | workspace_id | Status Column | RLS Enabled |
|-------|-------------|----------------|--------------|---------------|-------------|
| `eos_meetings` | uuid | bigint | uuid (nullable) | `meeting_status` enum | ✅ |
| `eos_meeting_participants` | uuid | bigint | - | - | ✅ |
| `eos_meeting_attendees` | uuid | bigint | - | - | ✅ |
| `eos_meeting_series` | uuid | bigint | uuid (nullable) | - | ✅ |
| `eos_meeting_ratings` | uuid | bigint | - | - | ✅ |
| `eos_meeting_segments` | uuid | - | - | - | ✅ |
| `eos_meeting_outcome_confirmations` | uuid | bigint | - | - | ✅ |
| `eos_rocks` | uuid | bigint | uuid (nullable) | `eos_rock_status` enum | ✅ |
| `eos_rock_milestones` | uuid | bigint | - | - | ✅ |
| `eos_issues` | uuid | bigint | uuid (nullable) | `eos_issue_status` enum | ✅ |
| `eos_todos` | uuid | bigint | - | `eos_todo_status` enum | ✅ |
| `eos_qc` | uuid | bigint (nullable) | uuid (nullable) | text | ✅ |
| `eos_scorecard_metrics` | uuid | bigint | - | - | ✅ |
| `eos_scorecard_entries` | uuid | bigint | uuid (nullable) | - | ✅ |
| `eos_vto` | uuid | bigint | - | - | ✅ |
| `eos_vto_sections` | uuid | - | - | - | ✅ |
| `eos_agenda_templates` | uuid | bigint | - | - | ✅ |
| `eos_agenda_template_segments` | uuid | - | - | - | ✅ |
| `eos_flight_plans` | uuid | integer | - | - | ✅ |
| `eos_health_snapshots` | uuid | bigint | - | - | ✅ |
| `eos_alerts` | uuid | bigint | - | text | ✅ |
| `eos_workspaces` | uuid | - | - | - | ✅ |

### 1.2 Accountability Chart Tables

| Table | Primary Key | tenant_id Type | Key Columns | RLS Enabled |
|-------|-------------|----------------|-------------|-------------|
| `accountability_charts` | uuid | bigint | status (text) | ✅ |
| `accountability_chart_versions` | uuid | bigint | version_number, snapshot | ✅ |
| `accountability_functions` | uuid | bigint | name, function_type, parent_function_id | ✅ |
| `accountability_seats` | uuid | bigint | seat_name, function_id, eos_role_type | ✅ |
| `accountability_seat_roles` | uuid | bigint | role_text, seat_id | ✅ |
| `accountability_seat_assignments` | uuid | bigint | user_id, seat_id, assignment_type | ✅ |

### 1.3 Supporting Tables

| Table | Purpose | RLS Enabled |
|-------|---------|-------------|
| `ai_suggestions` | AI-generated meeting suggestions | ✅ |
| `audit_eos_events` | EOS action audit trail | ✅ |
| `audit_gwc_trends` | GWC rating history | ✅ |
| `audit_seat_health` | Seat health recommendations | ✅ |
| `audit_succession_events` | Succession planning history | ✅ |
| `audit_people_analyzer` | People analyzer changes | ✅ |
| `people_analyzer_entries` | GWC assessments | ✅ |
| `seat_rebalancing_recommendations` | AI seat recommendations | ✅ |

---

## 2. Enum Audit

### 2.1 Rock Status Enum (`eos_rock_status`)

| DB Value | UI Display | Color Code |
|----------|------------|------------|
| `Not_Started` | Not Started | Gray |
| `On_Track` | On Track | Green |
| `At_Risk` | At Risk | Yellow |
| `Off_Track` | Off Track | Red |
| `Complete` | Complete | Blue |

**Status:** ✅ Correctly mapped via `rockStatusUtils.ts`

### 2.2 Issue Status Enum (`eos_issue_status`)

| DB Value | UI Display | Workflow |
|----------|------------|----------|
| `Open` | Open | Default state |
| `Discussing` | Discussing | In meeting |
| `In Review` | In Review | Being evaluated |
| `Actioning` | Actioning | Has assigned actions |
| `Escalated` | Escalated | Escalated to leadership |
| `Solved` | Solved | Resolution confirmed |
| `Closed` | Closed | Final state |
| `Archived` | Archived | Historical record |

**Status:** ✅ Direct match, types defined in `src/types/risksOpportunities.ts`

### 2.3 Todo Status Enum (`eos_todo_status`)

| DB Value | UI Display |
|----------|------------|
| `Open` | Open |
| `Complete` | Complete |
| `Cancelled` | Cancelled |

**Status:** ✅ Direct match

### 2.4 Meeting Status Enum (`meeting_status`)

| DB Value | Meaning |
|----------|---------|
| `scheduled` | Future meeting |
| `in_progress` | Currently active |
| `completed` | Finished normally |
| `cancelled` | Cancelled before start |
| `ready_to_close` | Awaiting final review |
| `closed` | Fully processed |
| `locked` | Read-only archive |

**Status:** ⚠️ Minor inconsistency - Code also checks `is_complete` boolean fallback

### 2.5 Meeting Type Enum (`eos_meeting_type`)

| DB Value | Description |
|----------|-------------|
| `L10` | Level 10 Weekly Meeting |
| `Quarterly` | Quarterly Planning |
| `Annual` | Annual Planning |
| `Focus_Day` | Focus Day Session |
| `Custom` | Custom meeting type |
| `Same_Page` | Same Page meeting |

**Status:** ✅ Direct match

### 2.6 Function Type Enum (`eos_function_type`)

| DB Value | Description |
|----------|-------------|
| `integrator` | Integrator (COO/CEO) |
| `visionary` | Visionary (CEO/Founder) |
| `sales_marketing` | Sales/Marketing |
| `operations` | Operations |
| `finance` | Finance |
| `people` | People/HR |
| `custom` | Custom function |

**Status:** ✅ Used for accountability chart structure

---

## 3. RLS Policy Audit

### 3.1 Recursion-Safe Helper Functions

| Function | Return Type | Security | row_security | Purpose |
|----------|-------------|----------|--------------|---------|
| `is_vivacity_team_safe(uuid)` | boolean | DEFINER | off | RLS-safe team membership check |
| `get_vivacity_workspace_id_safe()` | uuid | DEFINER | off | RLS-safe workspace ID lookup |
| `is_vivacity_member(uuid)` | boolean | DEFINER | off | Legacy team membership check |
| `user_has_tenant_access(bigint)` | boolean | DEFINER | - | Tenant access verification |

### 3.2 Standard Helper Functions

| Function | Return Type | Purpose |
|----------|-------------|---------|
| `is_vivacity_team()` | boolean | Check if current user is Vivacity Team |
| `is_vivacity_team_user(uuid)` | boolean | Check specific user is Vivacity Team |
| `is_staff()` | boolean | General staff check |
| `is_super_admin()` | boolean | SuperAdmin check |
| `get_current_user_tenant_id()` | bigint | Current user's tenant |
| `get_system_tenant_id()` | integer | Returns 6372 (Vivacity) |

### 3.3 Policy Coverage by Table

| Table | SELECT | INSERT | UPDATE | DELETE | Recursion Risk |
|-------|--------|--------|--------|--------|----------------|
| `eos_meetings` | ✅ Workspace | ✅ Workspace | ✅ Workspace | ✅ Workspace | FIXED |
| `eos_meeting_participants` | ✅ Team safe | ✅ Team safe | ✅ Team safe | ✅ Team safe | FIXED |
| `eos_meeting_attendees` | ✅ Team safe | ✅ Team safe | ✅ Team safe | ✅ Team safe | FIXED |
| `eos_rocks` | ✅ Multiple | ✅ Staff | ✅ Staff | ✅ Staff | LOW |
| `eos_issues` | ✅ Staff + tenant | ✅ Staff | ✅ Staff | ✅ Staff | LOW |
| `eos_qc` | ✅ Scope-based | ✅ Scope-based | ✅ Scope-based | ✅ Scope-based | LOW |
| `accountability_charts` | ✅ Team | ✅ Team | ✅ Team | ✅ Team | LOW |
| `accountability_functions` | ✅ Team | ⚠️ true | ⚠️ true | ⚠️ true | LOW |
| `accountability_seats` | ✅ Team | ⚠️ true | ⚠️ true | ⚠️ true | LOW |
| `accountability_seat_roles` | ✅ Team | ⚠️ true | ⚠️ true | ⚠️ true | LOW |
| `accountability_seat_assignments` | ✅ Team | ⚠️ true | ⚠️ true | ⚠️ true | LOW |

### 3.4 Security Warnings

| Issue | Table | Current Policy | Recommendation |
|-------|-------|----------------|----------------|
| Permissive INSERT | `accountability_functions` | `WITH CHECK (true)` | Add `is_vivacity_team()` |
| Permissive INSERT | `accountability_seats` | `WITH CHECK (true)` | Add `is_vivacity_team()` |
| Permissive INSERT | `accountability_seat_roles` | `WITH CHECK (true)` | Add `is_vivacity_team()` |
| Permissive INSERT | `accountability_seat_assignments` | `WITH CHECK (true)` | Add `is_vivacity_team()` |

---

## 4. Frontend Access Control

### 4.1 Route Protection

All EOS routes are protected via:
1. `ProtectedRoute` component - Requires authentication
2. `EOS_ROUTES` array in `useRBAC.tsx` - Vivacity Team check
3. `canAccessEOS()` function - Permission verification

### 4.2 Protected EOS Routes

```typescript
export const EOS_ROUTES = [
  '/eos',
  '/eos/overview',
  '/eos/scorecard',
  '/eos/vto',
  '/eos/mission-control',
  '/eos/rocks',
  '/eos/flight-plan',
  '/eos/risks-opportunities',
  '/eos/todos',
  '/eos/meetings',
  '/eos/qc',
  '/eos/quarterly-conversations',
  '/eos/accountability',
  '/eos/leadership',
  '/eos/rock-analysis',
  '/eos/client-impact',
  '/eos/health-check',
  '/processes',
];
```

### 4.3 Role-Based Permissions

| Role | EOS Access | eos:access Permission |
|------|------------|----------------------|
| SuperAdmin | ✅ Full | ✅ |
| Super Admin | ✅ Full | ✅ |
| Team Leader | ✅ Full | ✅ |
| Team Member | ✅ Limited | ✅ |
| Admin (Client) | ❌ None | ❌ |
| User (Client) | ❌ None | ❌ |
| General User | ❌ None | ❌ |

---

## 5. Edge Functions

### 5.1 EOS-Related Edge Functions

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `vivacity-assistant` | AI-powered EOS assistant | ✅ JWT |
| `sync-l10-participants` | Auto-populate L10 meetings | ✅ JWT |

### 5.2 Required Secrets

| Secret | Purpose | Configured |
|--------|---------|------------|
| `OPENAI_API_KEY` | AI assistant features | ✅ |

---

## 6. Known Issues & Fixes Applied

### 6.1 Critical Fixes (Applied)

| Issue | Location | Status |
|-------|----------|--------|
| RLS recursion on eos_meetings | Policies | ✅ FIXED |
| Missing L10 meeting instances | eos_meetings data | ✅ FIXED |
| Default R/O filter shows all | EosRisksOpportunities.tsx | ✅ FIXED |

### 6.2 Pending Fixes

| Issue | Location | Priority |
|-------|----------|----------|
| Permissive INSERT policies | accountability_* tables | HIGH |
| QC shows raw UUIDs | EosQC.tsx | MEDIUM |
| is_complete vs status confusion | eos_meetings | LOW |

---

## 7. Data Integrity

### 7.1 System Constants

| Constant | Value | Location |
|----------|-------|----------|
| VIVACITY_TENANT_ID | 6372 | `useVivacityTeamUsers.tsx` |
| Vivacity Workspace Slug | "vivacity" | `eos_workspaces` |

### 7.2 Foreign Key Relationships

- `eos_rocks.owner_id` → `users.user_uuid`
- `eos_issues.assigned_to` → `users.user_uuid`
- `eos_meetings.facilitator_id` → `users.user_uuid`
- `accountability_seat_assignments.user_id` → `users.user_uuid`
- All tenant_id columns → `tenants.id`

---

## 8. Compliance with Project Guidelines

| Requirement | Status |
|-------------|--------|
| EOS is Vivacity-only | ✅ Enforced |
| No client access to EOS | ✅ Blocked |
| RLS on all tables | ✅ Enabled |
| Audit trail for actions | ✅ audit_eos_events |
| UUID primary keys | ✅ Compliant |
| snake_case naming | ✅ Compliant |

---

## Appendix A: SQL Queries for Verification

### Check RLS Status
```sql
SELECT tablename, 
       rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'eos_%'
ORDER BY tablename;
```

### Check Enum Values
```sql
SELECT t.typname, e.enumlabel
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname LIKE 'eos_%'
ORDER BY t.typname, e.enumsortorder;
```

### Verify Vivacity Team Users
```sql
SELECT user_uuid, email, unicorn_role
FROM users
WHERE unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND archived = false
ORDER BY unicorn_role, email;
```

---

*Report generated by EOS Audit Harness v1.0*
