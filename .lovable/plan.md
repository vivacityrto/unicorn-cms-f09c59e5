

## CEO Executive Dashboard — Data Entry Management Pages

### Overview
Build three new SuperAdmin-only management pages for entering and managing data that feeds the CEO Dashboard panels. Each page provides full CRUD (Create, Read, Update, Delete) with table listings, modal forms, and links back to the Executive Dashboard.

### Pages to Create

#### 1. Financial Controls (`/executive/financial-controls`)
- **Table columns**: Control Type, Status, Due Date, Completed At, Amount Outstanding, Notes
- **Control types**: `xero_reconciliation`, `payroll`, `outstanding_balance`
- **Status options**: `ok`, `pending`, `overdue`, `flagged`
- **Form fields**: tenant selector, control type dropdown, status dropdown, due date picker, amount, notes textarea
- **Link from**: FinancialControlPanel header (pencil/manage icon)

#### 2. Client Commitments (`/executive/client-commitments`)
- **Table columns**: Tenant, Title, Due Date, Status, Impact Level, Assigned To, Completed At
- **Status options**: `pending`, `met`, `missed`, `at_risk`
- **Impact levels**: `low`, `medium`, `high`, `critical`
- **Form fields**: tenant selector (filtered to diamond-tier), title, description, due date, status, impact level, assigned to
- **Link from**: DiamondClientPanel header

#### 3. CEO Decision Queue (`/executive/decision-queue`)
- **Table columns**: Title, Impact Level, Recommended Option, Status, Submitted At, Days Pending, Decision Note
- **Status options**: `pending`, `decided`, `deferred`
- **Form fields**: title, description, impact level, recommended option, status, decision note
- **Link from**: DecisionQueuePanel header

### Technical Details

#### Routing (in App.tsx)
```
/executive/financial-controls  -> ProtectedRoute requireSuperAdmin
/executive/client-commitments  -> ProtectedRoute requireSuperAdmin
/executive/decision-queue      -> ProtectedRoute requireSuperAdmin
```

#### File Structure
```
src/pages/
  ExecutiveFinancialControls.tsx
  ExecutiveClientCommitments.tsx
  ExecutiveDecisionQueue.tsx
```

#### UI Pattern
Each page follows the existing ManageFields pattern:
- DashboardLayout wrapper
- Back button to /executive
- Search/filter bar
- Data table with edit/delete actions per row
- FormModal for create and edit
- AlertDialog for delete confirmation
- Toast notifications for success/error
- Loading states

#### Panel Drill-Down Links
Each CEO dashboard panel header gains a small "Manage" link icon (visible to SuperAdmins only) that navigates to the corresponding management page. This uses the existing `useRBAC().isSuperAdmin` check.

#### No Database Changes Required
All three tables already exist with proper RLS policies (SuperAdmin write, Vivacity team read). No migrations needed.

#### Data Flow
- `created_by` / `submitted_by` fields auto-populated from `auth.uid()` via the authenticated Supabase client
- `tenant_id` defaults to SYSTEM_TENANT_ID (6372) for financial controls and decision queue; client commitments use the selected tenant
- Forms validate required fields before submission

