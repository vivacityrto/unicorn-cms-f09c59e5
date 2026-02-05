

# EOS Audit & End-to-End Test Plan (Vivacity-Only)

## Executive Summary

This plan delivers a comprehensive audit harness for the EOS system, including:
1. **EOS Audit Report** (`/docs/eos-audit-report.md`) - Database schema, RLS policies, enums, and identified issues
2. **EOS Test Matrix** (`/docs/eos-test-matrix.md`) - Manual test cases grouped by module
3. **Automated Tests** - Vitest-based unit/integration tests for critical flows
4. **In-App Health Check Page** (`/eos/health-check`) - Admin-only diagnostic dashboard

---

## Part 1: EOS Audit Report Generation

### 1.1 Database Schema Audit

**EOS Tables Identified (26 tables):**

| Table | Key Columns | tenant_id Type | workspace_id | Status Column |
|-------|-------------|----------------|--------------|---------------|
| `eos_meetings` | id, meeting_type, status | bigint | uuid (nullable) | `meeting_status` enum |
| `eos_meeting_participants` | meeting_id, user_id | - | - | - |
| `eos_meeting_attendees` | meeting_id, user_id | - | - | - |
| `eos_meeting_series` | id, recurrence_type | bigint | uuid (nullable) | - |
| `eos_rocks` | id, title, status, owner_id | bigint | uuid (nullable) | `eos_rock_status` enum |
| `eos_issues` | id, title, status, item_type | bigint | uuid (nullable) | `eos_issue_status` enum |
| `eos_todos` | id, title, status | bigint | - | `eos_todo_status` enum |
| `eos_qc` | id, status, reviewee_id | bigint (nullable) | uuid (nullable) | text |
| `eos_scorecard_metrics` | id, name, owner_id | bigint | - | - |
| `eos_scorecard_entries` | id, metric_id, week_ending | bigint | uuid (nullable) | - |
| `eos_vto` | id, tenant_id | bigint | - | - |
| `eos_agenda_templates` | id, template_name | bigint | - | - |
| `eos_flight_plans` | id, quarter_year | integer | - | - |
| `eos_health_snapshots` | id, tenant_id | bigint | - | - |
| `eos_alerts` | id, status, tenant_id | bigint | - | text |
| `eos_workspaces` | id, slug, name | - | - | - |
| `accountability_charts` | id, tenant_id, status | bigint | - | text |
| `accountability_functions` | id, chart_id, name | bigint | - | - |
| `accountability_seats` | id, function_id, name | bigint | - | - |
| `accountability_seat_roles` | id, seat_id, role_text | bigint | - | - |
| `accountability_seat_assignments` | id, seat_id, user_id | bigint | - | - |

### 1.2 Enum Audit

**Current Enums vs UI Values:**

| Enum | DB Values | UI Usage | Status |
|------|-----------|----------|--------|
| `eos_rock_status` | Not_Started, On_Track, At_Risk, Off_Track, Complete | Uses `dbToUiStatus()` utility | OK - utility handles mapping |
| `eos_issue_status` | Open, Discussing, Solved, Archived, In Review, Actioning, Escalated, Closed | Direct match | OK |
| `eos_todo_status` | Open, Complete, Cancelled | Direct match | OK |
| `meeting_status` | scheduled, in_progress, completed, cancelled, ready_to_close, closed, locked | Uses `is_complete` boolean fallback | Minor inconsistency |
| `eos_meeting_type` | L10, Quarterly, Annual, Focus_Day, Custom, Same_Page | Direct match | OK |

**Issues Found:**
- `meeting_status` has 7 values but code also checks `is_complete` boolean
- Rock status uses underscores in DB (`On_Track`) but UI normalizes via `rockStatusUtils.ts`

### 1.3 RLS Policy Audit

**Recursion-Safe Functions (recently fixed):**
- `is_vivacity_team_safe(uuid)` - `SECURITY DEFINER` + `row_security=off`
- `get_vivacity_workspace_id_safe()` - `SECURITY DEFINER` + `row_security=off`

**Current RLS Policies on EOS Tables:**

| Table | Policy Count | Recursion Risk | Notes |
|-------|--------------|----------------|-------|
| `eos_meetings` | 4 | FIXED | Uses workspace-based policies |
| `eos_meeting_participants` | 2 | FIXED | Uses `is_vivacity_team_safe()` |
| `eos_meeting_attendees` | 2 | FIXED | Uses `is_vivacity_team_safe()` |
| `eos_rocks` | 6 | LOW | Multiple overlapping policies |
| `eos_issues` | 4 | LOW | Uses `is_staff()` and tenant checks |
| `eos_qc` | 4 | LOW | Has scope-based filtering |
| `accountability_*` | 4-6 each | LOW | Uses `is_vivacity_team()` |

**Security Warnings from Linter:**
- 6 policies with `WITH CHECK (true)` - need hardening
- 1 function with mutable search_path

### 1.4 Helper Functions Audit

| Function | Returns | Security | Usage |
|----------|---------|----------|-------|
| `is_vivacity_team_safe(uuid)` | boolean | DEFINER + row_security=off | RLS policies |
| `is_vivacity_member(uuid)` | boolean | DEFINER + row_security=off | Legacy |
| `is_vivacity_team()` | boolean | Regular | UI checks |
| `is_vivacity_team_user(uuid)` | boolean | Regular | Assignment validation |
| `is_staff()` | boolean | Regular | General staff check |
| `is_super_admin()` | boolean | Regular | Admin check |
| `get_vivacity_workspace_id_safe()` | uuid | DEFINER + row_security=off | RLS policies |

---

## Part 2: Test Matrix Creation

### 2.1 Access Control Tests

| Test ID | Module | Test Case | Precondition | Expected Result |
|---------|--------|-----------|--------------|-----------------|
| AC-001 | Navigation | EOS menu visible to Vivacity Team | Login as Team Member | EOS section visible in sidebar |
| AC-002 | Navigation | EOS menu hidden from clients | Login as Admin (client) | EOS section not in sidebar |
| AC-003 | URL Access | Direct /eos/* blocked for clients | Login as client, navigate to /eos/meetings | Redirect to /dashboard with toast |
| AC-004 | RLS | Client cannot SELECT eos_meetings | Client auth token | Empty result set |
| AC-005 | RLS | Vivacity Team can SELECT eos_meetings | Team Member auth token | Returns workspace meetings |
| AC-006 | RLS | Vivacity Team can INSERT eos_meetings | Team Member auth token | Insert succeeds |

### 2.2 Risks & Opportunities Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| RO-001 | Create from /eos/risks-opportunities | Click "Add", fill form, submit | Item appears in list with status "Open" |
| RO-002 | Create from meeting modal | Open meeting IDS segment, add issue | Item appears in master list at /eos/risks-opportunities |
| RO-003 | Filter by status | Select "Open" filter | Only Open items shown |
| RO-004 | Default filter is Open | Navigate to page | Only Open items shown by default |
| RO-005 | Status transitions | Change status from Open to Discussing | Status updates, allowed transitions only |

### 2.3 Accountability Chart Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| ACC-001 | Create chart from template | Click "Create from EOS Template" | Standard functions/seats created |
| ACC-002 | Add function | Click "Add Function", enter name | Function appears in chart |
| ACC-003 | Add seat to function | Click "Add Seat" on function | Seat card appears |
| ACC-004 | Assign owner | Click owner picker, select team member | Owner shown on seat card |
| ACC-005 | Owner picker shows Vivacity only | Open owner picker | Only Super Admin/Team Leader/Team Member shown |
| ACC-006 | Add accountability (role) | Click "Add Accountability" on seat | Role text appears in list |
| ACC-007 | One primary owner rule | Assign second primary owner | First owner end-dated, new owner assigned |

### 2.4 Rocks Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| ROCK-001 | Create Company Rock | Click "Add Company Rock", fill form | Rock appears in Company tab |
| ROCK-002 | Create Team Rock from Company | Click "Add Team Rock" on company rock | Team rock linked to parent |
| ROCK-003 | Create Individual Rock | Click "Add Individual Rock" on team rock | Individual rock linked to parent |
| ROCK-004 | Rock hierarchy rollup | Set child rock to Off Track | Parent shows rollup status |
| ROCK-005 | Milestone management | Add/edit/complete milestones | No duplicate rendering, saves persist |
| ROCK-006 | Quarter filtering | Change quarter selector | Rocks filtered by quarter |
| ROCK-007 | Owner picker Vivacity only | Open owner picker | Only Vivacity Team users shown |

### 2.5 Meetings Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| MTG-001 | Meetings list loads | Navigate to /eos/meetings | No RLS recursion error, meetings displayed |
| MTG-002 | Schedule L10 meeting | Click "Schedule Meeting", select L10 | Meeting created with auto-populated participants |
| MTG-003 | Facilitator picker Vivacity only | Open facilitator dropdown | Only Vivacity Team users |
| MTG-004 | Start meeting | Click "Start Meeting" | Meeting status changes to in_progress |
| MTG-005 | Add To-Do in meeting | In live meeting, add to-do | To-do created with meeting linkage |
| MTG-006 | Add Risk in meeting | In IDS segment, add risk | Risk appears in eos_issues with meeting reference |
| MTG-007 | End meeting | Click "End Meeting" | Status = completed, summary generated |
| MTG-008 | Recurring series generation | Complete L10, trigger closes | Next L10 auto-generated |

### 2.6 Quarterly Conversations Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| QC-001 | Schedule QC | Click "Schedule QC", fill form | QC created with status scheduled |
| QC-002 | Reviewee picker Vivacity only | Open reviewee dropdown | Only Vivacity Team users |
| QC-003 | Manager picker leaders only | Open manager dropdown | Only Super Admin/Team Leader |
| QC-004 | Complete QC session | Fill all sections, sign | QC status = completed |
| QC-005 | No tenant error | Schedule QC as Vivacity user | No "must belong to tenant" error |

### 2.7 Leadership Dashboard Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| LD-001 | Dashboard loads | Navigate to /eos/leadership | KPIs, charts displayed |
| LD-002 | Client blocked | Login as client, access /eos/leadership | Redirect to /dashboard |
| LD-003 | Drill-down to rocks | Click rock KPI | Navigate to /eos/rocks |
| LD-004 | IDS summary accurate | Check IDS panel | Counts match eos_issues |

### 2.8 Client Impact Tests

| Test ID | Test Case | Steps | Expected |
|---------|-----------|-------|----------|
| CI-001 | Generate report | Click "Generate Report" | Draft report created |
| CI-002 | View report | Click on report card | Report details displayed |
| CI-003 | Publish report | Click "Publish" | Report marked as published |
| CI-004 | Read-only for output | Check report content | No edit actions available on generated content |

---

## Part 3: Automated Test Implementation

### 3.1 Test Setup

Create the following test infrastructure:

```
src/test/
├── setup.ts                    # Vitest setup with mocks
├── eos/
│   ├── access-control.test.tsx # RBAC tests
│   ├── risks-opportunities.test.tsx
│   ├── rocks.test.tsx
│   ├── meetings.test.tsx
│   ├── accountability.test.tsx
│   ├── qc.test.tsx
│   └── health-check.test.tsx
└── fixtures/
    └── eos-test-data.ts        # Mock data
```

### 3.2 Key Test Files

**File: `src/test/eos/access-control.test.tsx`**
```typescript
describe('EOS Access Control', () => {
  it('should show EOS menu for Vivacity Team users', async () => {
    // Mock useAuth with unicorn_role: 'Team Member'
    // Render DashboardLayout
    // Expect EOS menu items visible
  });

  it('should hide EOS menu for client users', async () => {
    // Mock useAuth with unicorn_role: 'Admin'
    // Render DashboardLayout
    // Expect EOS menu items not visible
  });

  it('should redirect clients from EOS routes', async () => {
    // Mock useAuth with client role
    // Render ProtectedRoute with EOS route
    // Expect Navigate to /dashboard
  });
});
```

**File: `src/test/eos/risks-opportunities.test.tsx`**
```typescript
describe('Risks & Opportunities', () => {
  it('should default to Open status filter', () => {
    // Render EosRisksOpportunities
    // Expect filterStatus initial value = 'Open'
  });

  it('should create item from ad-hoc form', async () => {
    // Mock supabase insert
    // Fill form, submit
    // Expect insert called with correct data
  });

  it('should validate status transitions', async () => {
    // Try invalid transition Open → Closed
    // Expect error
  });
});
```

### 3.3 Test Configuration

**File: `vitest.config.ts`**
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

---

## Part 4: In-App EOS Health Check Page

### 4.1 New Page: `/eos/health-check`

Create `src/pages/EosHealthCheck.tsx`:

**Features:**
1. **Read-Only Checks** (auto-run on load):
   - Can SELECT from each EOS table
   - Enum validation (rock statuses, issue statuses)
   - RLS "canary" check (current user can read workspace data)
   - Vivacity workspace exists
   - System tenant ID = 6372

2. **Write Tests** (behind toggle):
   - Create temp records with `test_run_id`
   - Verify insert/update/delete operations
   - Clean up test data on completion

3. **UI Components:**
   - Pass/Fail badge for each check
   - Expandable error details
   - "Re-run All" button
   - Export results as JSON

### 4.2 Health Check Implementation

```typescript
interface HealthCheck {
  id: string;
  name: string;
  category: 'read' | 'write' | 'rls' | 'enum';
  status: 'pass' | 'fail' | 'running' | 'pending';
  message?: string;
  duration?: number;
}

const healthChecks: HealthCheck[] = [
  { id: 'vivacity-workspace', name: 'Vivacity workspace exists', category: 'read', status: 'pending' },
  { id: 'eos-meetings-select', name: 'Can SELECT eos_meetings', category: 'read', status: 'pending' },
  { id: 'eos-rocks-select', name: 'Can SELECT eos_rocks', category: 'read', status: 'pending' },
  { id: 'eos-issues-select', name: 'Can SELECT eos_issues', category: 'read', status: 'pending' },
  { id: 'eos-qc-select', name: 'Can SELECT eos_qc', category: 'read', status: 'pending' },
  { id: 'accountability-chart-select', name: 'Can SELECT accountability_charts', category: 'read', status: 'pending' },
  { id: 'rock-status-enum', name: 'Rock status enum valid', category: 'enum', status: 'pending' },
  { id: 'issue-status-enum', name: 'Issue status enum valid', category: 'enum', status: 'pending' },
  { id: 'rls-vivacity-access', name: 'RLS allows Vivacity Team access', category: 'rls', status: 'pending' },
];
```

### 4.3 Route Registration

Add to `src/App.tsx`:
```tsx
const EosHealthCheck = lazy(() => import("./pages/EosHealthCheck"));

<Route 
  path="/eos/health-check" 
  element={
    <ProtectedRoute>
      <EosHealthCheck />
    </ProtectedRoute>
  } 
/>
```

Add to `EOS_ROUTES` in `useRBAC.tsx`:
```tsx
'/eos/health-check',
```

---

## Part 5: Known Issues & Fixes Required

### 5.1 Critical Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| RLS recursion (FIXED) | eos_meetings policies | Applied in recent migration |
| Missing L10 instances | eos_meetings data | Generated 12 instances |
| Default status filter | EosRisksOpportunities.tsx | Changed to 'Open' |

### 5.2 Security Hardening Needed

| Issue | Table | Current | Fix |
|-------|-------|---------|-----|
| Permissive INSERT | accountability_seat_assignments | `WITH CHECK (true)` | Add `is_vivacity_team()` check |
| Permissive INSERT | accountability_functions | `WITH CHECK (true)` | Add `is_vivacity_team()` check |
| Permissive INSERT | accountability_seats | `WITH CHECK (true)` | Add `is_vivacity_team()` check |
| Permissive INSERT | accountability_seat_roles | `WITH CHECK (true)` | Add `is_vivacity_team()` check |

### 5.3 Minor Inconsistencies

| Issue | Location | Recommendation |
|-------|----------|----------------|
| QC shows raw UUIDs | EosQC.tsx line 166 | Resolve to user names |
| Meeting is_complete vs status | eos_meetings | Document the canonical field |
| Rock status underscore format | DB enum | Continue using utility mapping |

---

## Part 6: Implementation Order

### Phase 1: Documentation (Immediate)
1. Create `/docs/eos-audit-report.md` with full schema and policy analysis
2. Create `/docs/eos-test-matrix.md` with all test cases

### Phase 2: Test Infrastructure
3. Add vitest dependencies to package.json
4. Create `vitest.config.ts`
5. Create `src/test/setup.ts`

### Phase 3: Automated Tests
6. Create `src/test/eos/access-control.test.tsx`
7. Create `src/test/eos/risks-opportunities.test.tsx`
8. Create `src/test/eos/rocks.test.tsx`
9. Create `src/test/eos/meetings.test.tsx`

### Phase 4: Health Check Page
10. Create `src/pages/EosHealthCheck.tsx`
11. Create `src/hooks/useEosHealthCheck.tsx`
12. Add route to App.tsx
13. Add to EOS_ROUTES

### Phase 5: Security Hardening
14. Migration to fix permissive INSERT policies
15. Add search_path to mutable functions

### Phase 6: Final Verification
16. Run all automated tests
17. Execute manual test matrix
18. Verify Health Check page shows all green

---

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `docs/eos-audit-report.md` | Comprehensive schema/RLS/enum documentation |
| `docs/eos-test-matrix.md` | Manual test cases with expected results |
| `vitest.config.ts` | Test runner configuration |
| `src/test/setup.ts` | Test environment setup |
| `src/test/fixtures/eos-test-data.ts` | Mock data for tests |
| `src/test/eos/*.test.tsx` | Automated test files |
| `src/pages/EosHealthCheck.tsx` | Admin health check page |
| `src/hooks/useEosHealthCheck.tsx` | Health check logic hook |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add EosHealthCheck route |
| `src/hooks/useRBAC.tsx` | Add /eos/health-check to EOS_ROUTES |
| `package.json` | Add vitest and testing-library dependencies |
| `tsconfig.app.json` | Add vitest/globals type |

### Database Migrations

| Migration | Purpose |
|-----------|---------|
| `fix_permissive_insert_policies.sql` | Harden INSERT policies on accountability_* tables |
| `add_search_path_to_functions.sql` | Set fixed search_path on mutable functions |

---

## Acceptance Criteria

1. ✅ `/docs/eos-audit-report.md` documents all EOS tables, columns, enums, and RLS policies
2. ✅ `/docs/eos-test-matrix.md` contains 40+ test cases covering all EOS modules
3. ✅ Automated tests run with `npm run test` (vitest)
4. ✅ `/eos/health-check` page accessible to Vivacity Team only
5. ✅ Health Check shows all green for authenticated Vivacity user
6. ✅ No console errors (enum invalid, uuid mismatch, tenant errors, RLS recursion)
7. ✅ Non-Vivacity users cannot access any /eos/* routes or read EOS data

