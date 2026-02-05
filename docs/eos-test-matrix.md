# EOS Test Matrix

**Generated:** 2026-02-05  
**Scope:** Unicorn 2.0 EOS System (Vivacity-Only)

---

## Test Categories

1. [Access Control (AC)](#1-access-control-tests)
2. [Risks & Opportunities (RO)](#2-risks--opportunities-tests)
3. [Accountability Chart (ACC)](#3-accountability-chart-tests)
4. [Rocks (ROCK)](#4-rocks-tests)
5. [Meetings (MTG)](#5-meetings-tests)
6. [Quarterly Conversations (QC)](#6-quarterly-conversations-tests)
7. [Leadership Dashboard (LD)](#7-leadership-dashboard-tests)
8. [Client Impact (CI)](#8-client-impact-tests)
9. [Health Check (HC)](#9-health-check-tests)

---

## 1. Access Control Tests

### AC-001: EOS Menu Visible to Vivacity Team
| Field | Value |
|-------|-------|
| **Precondition** | User logged in as Team Member (unicorn_role = 'Team Member') |
| **Steps** | 1. Navigate to /dashboard |
| **Expected** | EOS section visible in sidebar with all sub-items |
| **Priority** | Critical |

### AC-002: EOS Menu Hidden from Client Users
| Field | Value |
|-------|-------|
| **Precondition** | User logged in as Admin (client tenant role) |
| **Steps** | 1. Navigate to /dashboard |
| **Expected** | EOS section NOT visible in sidebar |
| **Priority** | Critical |

### AC-003: Direct URL Access Blocked for Clients
| Field | Value |
|-------|-------|
| **Precondition** | User logged in as client Admin |
| **Steps** | 1. Directly navigate to /eos/meetings |
| **Expected** | Redirect to /dashboard with toast message "EOS is available to the Vivacity Team only" |
| **Priority** | Critical |

### AC-004: RLS Blocks Client SELECT on eos_meetings
| Field | Value |
|-------|-------|
| **Precondition** | Client user auth token |
| **Steps** | 1. Execute: `supabase.from('eos_meetings').select('*')` |
| **Expected** | Empty result set (no error, just no data) |
| **Priority** | Critical |

### AC-005: RLS Allows Vivacity Team SELECT
| Field | Value |
|-------|-------|
| **Precondition** | Team Member auth token |
| **Steps** | 1. Execute: `supabase.from('eos_meetings').select('*')` |
| **Expected** | Returns meetings from Vivacity workspace |
| **Priority** | Critical |

### AC-006: RLS Allows Vivacity Team INSERT
| Field | Value |
|-------|-------|
| **Precondition** | Team Member auth token |
| **Steps** | 1. Execute insert on eos_meetings with valid data |
| **Expected** | Insert succeeds without RLS error |
| **Priority** | Critical |

### AC-007: SuperAdmin Full Access
| Field | Value |
|-------|-------|
| **Precondition** | User logged in as SuperAdmin |
| **Steps** | 1. Navigate through all EOS pages |
| **Expected** | All pages accessible, all actions available |
| **Priority** | High |

---

## 2. Risks & Opportunities Tests

### RO-001: Create from Main Page
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user on /eos/risks-opportunities |
| **Steps** | 1. Click "Add Risk" or "Add Opportunity"<br>2. Fill required fields (Title, Category)<br>3. Submit |
| **Expected** | Item appears in list with status "Open" |
| **Priority** | High |

### RO-002: Create from Meeting Modal
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user in live L10 meeting IDS segment |
| **Steps** | 1. Click "Add Issue"<br>2. Fill form<br>3. Submit |
| **Expected** | Item created and visible in master list at /eos/risks-opportunities |
| **Priority** | High |

### RO-003: Filter by Status
| Field | Value |
|-------|-------|
| **Precondition** | Multiple items with different statuses exist |
| **Steps** | 1. Select "Open" from status filter |
| **Expected** | Only items with status "Open" displayed |
| **Priority** | Medium |

### RO-004: Default Filter is Open
| Field | Value |
|-------|-------|
| **Precondition** | Items exist with various statuses |
| **Steps** | 1. Navigate to /eos/risks-opportunities |
| **Expected** | Only "Open" items shown by default |
| **Priority** | Medium |

### RO-005: Status Transitions
| Field | Value |
|-------|-------|
| **Precondition** | Item with status "Open" |
| **Steps** | 1. Change status to "Discussing" |
| **Expected** | Status updates successfully |
| **Priority** | Medium |

### RO-006: Filter by Type (Risk/Opportunity)
| Field | Value |
|-------|-------|
| **Precondition** | Both risks and opportunities exist |
| **Steps** | 1. Select "Risks" from type filter |
| **Expected** | Only risks displayed |
| **Priority** | Medium |

### RO-007: Filter by Category
| Field | Value |
|-------|-------|
| **Precondition** | Items in multiple categories exist |
| **Steps** | 1. Select "Compliance" from category filter |
| **Expected** | Only items in Compliance category displayed |
| **Priority** | Medium |

### RO-008: Clear Filters
| Field | Value |
|-------|-------|
| **Precondition** | Filters applied |
| **Steps** | 1. Click "Clear" button |
| **Expected** | Filters reset (status back to "Open") |
| **Priority** | Low |

---

## 3. Accountability Chart Tests

### ACC-001: Create Chart from Template
| Field | Value |
|-------|-------|
| **Precondition** | No accountability chart exists |
| **Steps** | 1. Navigate to /eos/accountability<br>2. Click "Create from EOS Template" |
| **Expected** | Standard EOS functions and seats created |
| **Priority** | High |

### ACC-002: Add Function
| Field | Value |
|-------|-------|
| **Precondition** | Chart exists |
| **Steps** | 1. Click "Add Function"<br>2. Enter name<br>3. Save |
| **Expected** | New function appears in chart structure |
| **Priority** | High |

### ACC-003: Add Seat to Function
| Field | Value |
|-------|-------|
| **Precondition** | Function exists |
| **Steps** | 1. Click "Add Seat" on a function<br>2. Enter seat name<br>3. Save |
| **Expected** | Seat card appears under function |
| **Priority** | High |

### ACC-004: Assign Owner to Seat
| Field | Value |
|-------|-------|
| **Precondition** | Seat exists |
| **Steps** | 1. Click owner picker on seat<br>2. Select team member |
| **Expected** | Owner displayed on seat card with avatar |
| **Priority** | High |

### ACC-005: Owner Picker Shows Vivacity Only
| Field | Value |
|-------|-------|
| **Precondition** | Seat exists |
| **Steps** | 1. Open owner picker dropdown |
| **Expected** | Only Super Admin, Team Leader, Team Member users listed |
| **Priority** | Critical |

### ACC-006: Add Accountability (Role)
| Field | Value |
|-------|-------|
| **Precondition** | Seat exists |
| **Steps** | 1. Click "Add Accountability"<br>2. Enter role text<br>3. Save |
| **Expected** | Role appears in seat's roles list |
| **Priority** | Medium |

### ACC-007: One Primary Owner Rule
| Field | Value |
|-------|-------|
| **Precondition** | Seat has assigned owner |
| **Steps** | 1. Assign different user as primary owner |
| **Expected** | Previous owner end-dated, new owner assigned |
| **Priority** | High |

### ACC-008: Edit Function Name
| Field | Value |
|-------|-------|
| **Precondition** | Function exists |
| **Steps** | 1. Click edit on function<br>2. Change name<br>3. Save |
| **Expected** | Name updates without error |
| **Priority** | Medium |

### ACC-009: Delete Seat
| Field | Value |
|-------|-------|
| **Precondition** | Seat exists with no dependencies |
| **Steps** | 1. Click delete on seat<br>2. Confirm |
| **Expected** | Seat removed from chart |
| **Priority** | Medium |

---

## 4. Rocks Tests

### ROCK-001: Create Company Rock
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user on /eos/rocks |
| **Steps** | 1. Click "Add Company Rock"<br>2. Fill title, owner, quarter<br>3. Save |
| **Expected** | Rock appears in Company tab with "Not Started" status |
| **Priority** | High |

### ROCK-002: Create Team Rock
| Field | Value |
|-------|-------|
| **Precondition** | Company rock exists |
| **Steps** | 1. Click "Add Team Rock" on company rock<br>2. Fill form<br>3. Save |
| **Expected** | Team rock linked to parent company rock |
| **Priority** | High |

### ROCK-003: Create Individual Rock
| Field | Value |
|-------|-------|
| **Precondition** | Team rock exists |
| **Steps** | 1. Click "Add Individual Rock"<br>2. Fill form<br>3. Save |
| **Expected** | Individual rock linked to parent |
| **Priority** | High |

### ROCK-004: Rock Status Update
| Field | Value |
|-------|-------|
| **Precondition** | Rock exists |
| **Steps** | 1. Change status to "On Track" |
| **Expected** | Status updates with correct color |
| **Priority** | High |

### ROCK-005: Milestone Management
| Field | Value |
|-------|-------|
| **Precondition** | Rock exists |
| **Steps** | 1. Add milestone<br>2. Complete milestone<br>3. Reload page |
| **Expected** | No duplicate rendering, milestones persist |
| **Priority** | High |

### ROCK-006: Quarter Filtering
| Field | Value |
|-------|-------|
| **Precondition** | Rocks in multiple quarters |
| **Steps** | 1. Change quarter selector |
| **Expected** | Only rocks for selected quarter shown |
| **Priority** | Medium |

### ROCK-007: Owner Picker Vivacity Only
| Field | Value |
|-------|-------|
| **Precondition** | Creating/editing rock |
| **Steps** | 1. Open owner dropdown |
| **Expected** | Only Vivacity Team users listed |
| **Priority** | Critical |

### ROCK-008: Link Rock to Accountability
| Field | Value |
|-------|-------|
| **Precondition** | Rock and accountability seat exist |
| **Steps** | 1. Edit rock<br>2. Link to seat/function |
| **Expected** | Linkage saved and displayed |
| **Priority** | Medium |

### ROCK-009: Hierarchy Rollup Display
| Field | Value |
|-------|-------|
| **Precondition** | Parent rock with child rocks |
| **Steps** | 1. Set child to "Off Track" |
| **Expected** | Parent shows rollup indicator |
| **Priority** | Medium |

---

## 5. Meetings Tests

### MTG-001: Meetings List Loads
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user |
| **Steps** | 1. Navigate to /eos/meetings |
| **Expected** | Page loads without RLS recursion error, meetings displayed |
| **Priority** | Critical |

### MTG-002: Schedule L10 Meeting
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user |
| **Steps** | 1. Click "Schedule Meeting"<br>2. Select L10 type<br>3. Set date/time<br>4. Submit |
| **Expected** | Meeting created with auto-populated Vivacity participants |
| **Priority** | High |

### MTG-003: Facilitator Picker Vivacity Only
| Field | Value |
|-------|-------|
| **Precondition** | Scheduling meeting |
| **Steps** | 1. Open facilitator dropdown |
| **Expected** | Only Vivacity Team users listed |
| **Priority** | Critical |

### MTG-004: Start Meeting
| Field | Value |
|-------|-------|
| **Precondition** | Scheduled meeting exists |
| **Steps** | 1. Click "Start Meeting" |
| **Expected** | Status changes to "in_progress", live view opens |
| **Priority** | High |

### MTG-005: Add To-Do in Meeting
| Field | Value |
|-------|-------|
| **Precondition** | In live meeting |
| **Steps** | 1. Navigate to To-Do segment<br>2. Add to-do<br>3. Assign owner |
| **Expected** | To-do created with meeting linkage |
| **Priority** | High |

### MTG-006: Add Risk in Meeting IDS
| Field | Value |
|-------|-------|
| **Precondition** | In live meeting IDS segment |
| **Steps** | 1. Click "Add Issue"<br>2. Select "Risk"<br>3. Fill form<br>4. Submit |
| **Expected** | Risk appears in eos_issues with meeting reference |
| **Priority** | High |

### MTG-007: End Meeting
| Field | Value |
|-------|-------|
| **Precondition** | Meeting in progress |
| **Steps** | 1. Click "End Meeting"<br>2. Confirm |
| **Expected** | Status = completed, summary available |
| **Priority** | High |

### MTG-008: View Meeting Summary
| Field | Value |
|-------|-------|
| **Precondition** | Completed meeting |
| **Steps** | 1. Click on completed meeting |
| **Expected** | Summary page displays with all segments |
| **Priority** | Medium |

### MTG-009: Recurring Series Generation
| Field | Value |
|-------|-------|
| **Precondition** | L10 recurring series |
| **Steps** | 1. Complete current L10 |
| **Expected** | Next occurrence auto-generated |
| **Priority** | Medium |

### MTG-010: Meeting Participants Display
| Field | Value |
|-------|-------|
| **Precondition** | Meeting with participants |
| **Steps** | 1. View meeting details |
| **Expected** | All participants shown with names/avatars |
| **Priority** | Medium |

---

## 6. Quarterly Conversations Tests

### QC-001: Schedule QC
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user on /eos/qc |
| **Steps** | 1. Click "Schedule QC"<br>2. Select reviewee and manager<br>3. Set date<br>4. Save |
| **Expected** | QC created with status "scheduled" |
| **Priority** | High |

### QC-002: Reviewee Picker Vivacity Only
| Field | Value |
|-------|-------|
| **Precondition** | Scheduling QC |
| **Steps** | 1. Open reviewee dropdown |
| **Expected** | Only Vivacity Team users listed |
| **Priority** | Critical |

### QC-003: Manager Picker Shows Leaders
| Field | Value |
|-------|-------|
| **Precondition** | Scheduling QC |
| **Steps** | 1. Open manager dropdown |
| **Expected** | Only Super Admin and Team Leader users listed |
| **Priority** | High |

### QC-004: Complete QC Session
| Field | Value |
|-------|-------|
| **Precondition** | QC in progress |
| **Steps** | 1. Fill all sections<br>2. Add signatures<br>3. Complete |
| **Expected** | QC status = completed |
| **Priority** | High |

### QC-005: No Tenant Error on Create
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity user with null tenant_id |
| **Steps** | 1. Schedule QC |
| **Expected** | No "must belong to tenant" error |
| **Priority** | Critical |

### QC-006: View QC History
| Field | Value |
|-------|-------|
| **Precondition** | Completed QCs exist |
| **Steps** | 1. Navigate to history tab |
| **Expected** | All past QCs displayed with dates |
| **Priority** | Medium |

---

## 7. Leadership Dashboard Tests

### LD-001: Dashboard Loads
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user |
| **Steps** | 1. Navigate to /eos/leadership |
| **Expected** | KPIs, charts, and tiles displayed |
| **Priority** | High |

### LD-002: Client Blocked from Dashboard
| Field | Value |
|-------|-------|
| **Precondition** | Client user logged in |
| **Steps** | 1. Navigate directly to /eos/leadership |
| **Expected** | Redirect to /dashboard with toast |
| **Priority** | Critical |

### LD-003: Drill-down to Rocks
| Field | Value |
|-------|-------|
| **Precondition** | On leadership dashboard |
| **Steps** | 1. Click rock status KPI tile |
| **Expected** | Navigate to /eos/rocks with filter applied |
| **Priority** | Medium |

### LD-004: IDS Summary Accuracy
| Field | Value |
|-------|-------|
| **Precondition** | Issues exist in eos_issues |
| **Steps** | 1. Compare IDS panel counts with direct query |
| **Expected** | Counts match database |
| **Priority** | Medium |

### LD-005: Meeting Cadence Display
| Field | Value |
|-------|-------|
| **Precondition** | L10 meetings scheduled |
| **Steps** | 1. View meeting cadence section |
| **Expected** | Shows compliance percentage |
| **Priority** | Low |

---

## 8. Client Impact Tests

### CI-001: Generate Report
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user with EOS activity |
| **Steps** | 1. Navigate to /eos/client-impact<br>2. Click "Generate Report" |
| **Expected** | Draft report created from EOS data |
| **Priority** | Medium |

### CI-002: View Report
| Field | Value |
|-------|-------|
| **Precondition** | Report exists |
| **Steps** | 1. Click on report card |
| **Expected** | Report details displayed |
| **Priority** | Medium |

### CI-003: Publish Report
| Field | Value |
|-------|-------|
| **Precondition** | Draft report exists |
| **Steps** | 1. Click "Publish" |
| **Expected** | Report marked as published |
| **Priority** | Medium |

### CI-004: Read-Only Output
| Field | Value |
|-------|-------|
| **Precondition** | Viewing published report |
| **Steps** | 1. Check for edit actions |
| **Expected** | No edit buttons on generated content |
| **Priority** | Low |

---

## 9. Health Check Tests

### HC-001: Health Check Page Loads
| Field | Value |
|-------|-------|
| **Precondition** | Vivacity Team user |
| **Steps** | 1. Navigate to /eos/health-check |
| **Expected** | Page loads with diagnostic checks |
| **Priority** | High |

### HC-002: Read Checks Execute
| Field | Value |
|-------|-------|
| **Precondition** | On health check page |
| **Steps** | 1. Observe automatic checks |
| **Expected** | All read checks show pass/fail status |
| **Priority** | High |

### HC-003: Write Checks (with toggle)
| Field | Value |
|-------|-------|
| **Precondition** | On health check page |
| **Steps** | 1. Enable "Run write tests"<br>2. Click "Run All" |
| **Expected** | Write tests execute, temp data cleaned up |
| **Priority** | Medium |

### HC-004: Export Results
| Field | Value |
|-------|-------|
| **Precondition** | Checks completed |
| **Steps** | 1. Click "Export JSON" |
| **Expected** | JSON file downloaded with all results |
| **Priority** | Low |

### HC-005: Re-run All Button
| Field | Value |
|-------|-------|
| **Precondition** | Checks completed |
| **Steps** | 1. Click "Re-run All" |
| **Expected** | All checks execute again |
| **Priority** | Low |

### HC-006: Client Blocked from Health Check
| Field | Value |
|-------|-------|
| **Precondition** | Client user logged in |
| **Steps** | 1. Navigate to /eos/health-check |
| **Expected** | Redirect to /dashboard |
| **Priority** | Critical |

---

## Test Data Fixtures

### Required Test Users
| Role | Email Pattern | Purpose |
|------|---------------|---------|
| SuperAdmin | superadmin@vivacity.com.au | Full access testing |
| Team Leader | teamlead@vivacity.com.au | Staff access testing |
| Team Member | teammember@vivacity.com.au | Limited staff testing |
| Client Admin | admin@clienttenant.com | Blocked access testing |
| Client User | user@clienttenant.com | Blocked access testing |

### Required Test Data
- At least 1 accountability chart with functions and seats
- At least 3 rocks (company, team, individual hierarchy)
- At least 5 issues/opportunities with various statuses
- At least 2 meetings (1 scheduled, 1 completed)
- At least 1 QC record

---

## Automation Status

| Category | Total Tests | Automated | Manual Only |
|----------|-------------|-----------|-------------|
| Access Control | 7 | 7 | 0 |
| Risks & Opportunities | 8 | 5 | 3 |
| Accountability Chart | 9 | 6 | 3 |
| Rocks | 9 | 6 | 3 |
| Meetings | 10 | 7 | 3 |
| Quarterly Conversations | 6 | 4 | 2 |
| Leadership Dashboard | 5 | 3 | 2 |
| Client Impact | 4 | 2 | 2 |
| Health Check | 6 | 6 | 0 |
| **TOTAL** | **64** | **46** | **18** |

---

*Test Matrix generated by EOS Audit Harness v1.0*
