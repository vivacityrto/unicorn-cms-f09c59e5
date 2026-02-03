
# Add Client Success Champion (CSC) Assignment Feature

## Analysis Summary

The backend infrastructure for CSC assignment already exists, but the frontend has not been connected to it yet. Currently, the system uses `connected_tenants` as a self-assignment mechanism (staff connect themselves to tenants), but the proper `tenant_csc_assignments` table exists for administrative assignment.

### Current State

| Component | Status |
|-----------|--------|
| `tenant_csc_assignments` table | Exists |
| `admin_set_tenant_csc_assignment` RPC | Exists |
| `admin_remove_tenant_csc_assignment` RPC | Exists |
| `get_csc_users` RPC | Exists |
| Frontend assignment UI | Missing |

### Gaps Identified

1. **ManageTenants page** - Shows "Not Assigned" for CSC column, reads from `connected_tenants` instead of `tenant_csc_assignments`
2. **ClientDetail page** - Has a CSC display section but fetches from `connected_tenants`, no ability to assign/change CSC
3. **No assignment UI** - SuperAdmins cannot select and assign a CSC to a client

---

## Implementation Plan

### Phase 1: Create CSC Assignment Component

**New File: `src/components/client/CSCAssignmentSelector.tsx`**

Create a dropdown component that:
- Fetches available CSC users via `get_csc_users` RPC
- Shows the currently assigned CSC (if any)
- Allows SuperAdmin to select a new CSC
- Calls `admin_set_tenant_csc_assignment` to persist the assignment
- Includes "Unassign" option that calls `admin_remove_tenant_csc_assignment`

```text
Component Structure:
- Dropdown/Combobox with CSC avatars and names
- Shows current assignment with primary badge
- Loading state while fetching users
- Confirmation on change
- Audit logging via the RPCs
```

### Phase 2: Create Hook for CSC Assignment Management

**New File: `src/hooks/useTenantCSCAssignment.tsx`**

Create a hook that:
- Fetches the current CSC assignment from `tenant_csc_assignments`
- Fetches available CSC users via `get_csc_users`
- Provides mutation functions for assignment and removal
- Handles optimistic updates and error recovery

```typescript
interface UseTenantCSCAssignment {
  currentCSC: CSCUser | null;
  availableCSCs: CSCUser[];
  isLoading: boolean;
  assignCSC: (cscUserId: string) => Promise<void>;
  removeCSC: () => Promise<void>;
}
```

### Phase 3: Add CSC Assignment to Client Detail Header

**File: `src/pages/ClientDetail.tsx`**

Modify the client header to include CSC assignment:
- Replace the read-only CSC display with the new `CSCAssignmentSelector`
- Fetch CSC from `tenant_csc_assignments` instead of `connected_tenants`
- Only allow SuperAdmin and Team Leaders to change assignment
- Show read-only view for other users

Changes:
1. Update `fetchCscUser()` to query `tenant_csc_assignments` instead of `connected_tenants`
2. Add the CSC assignment selector component next to the client name
3. Conditionally show edit controls based on `canEdit` permission

### Phase 4: Update ManageTenants List to Use Proper CSC Table

**File: `src/pages/ManageTenants.tsx`**

Update the CSC column data source:
1. Change the CSC fetch query from `connected_tenants` to `tenant_csc_assignments`
2. Filter to only show the primary CSC (`is_primary = true`)
3. Add click handler on CSC cell to open a quick-assign dialog
4. Maintain real-time subscription for CSC changes

```sql
-- Current (wrong):
SELECT tenant_id, user_uuid FROM connected_tenants

-- Updated (correct):
SELECT tenant_id, csc_user_id, is_primary 
FROM tenant_csc_assignments 
WHERE is_primary = true
```

### Phase 5: Add Quick-Assign Dialog for ManageTenants

**New File: `src/components/client/CSCQuickAssignDialog.tsx`**

Create a dialog that opens when clicking the CSC cell in the tenant list:
- Shows available CSC users in a list
- Displays current assignment with checkmark
- One-click assignment without navigating to client detail
- Accessible only to SuperAdmin/Team Leaders

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useTenantCSCAssignment.tsx` | Create | Hook for fetching and managing CSC assignments |
| `src/components/client/CSCAssignmentSelector.tsx` | Create | Dropdown component for selecting CSC |
| `src/components/client/CSCQuickAssignDialog.tsx` | Create | Dialog for quick CSC assignment from list view |
| `src/pages/ClientDetail.tsx` | Modify | Add CSC assignment UI to header, update data source |
| `src/pages/ManageTenants.tsx` | Modify | Update CSC column data source, add quick-assign interaction |

---

## UI/UX Design

### Client Detail Header
```
+------------------------------------------------------------------+
| <- Back to Clients                                                |
|                                                                   |
| [Avatar]  Academy of Global Business Training                    |
|           /academy-of-global-business-training                   |
|                                                                   |
|           CSC: [Avatar] Angela Connell-Richards  [Edit button]   |
|                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^                   |
|                (Clicking shows dropdown of available CSCs)        |
+------------------------------------------------------------------+
```

### ManageTenants CSC Column
```
+----------+
|   CSC    |
+----------+
| [Avatar] |  <- Clickable, opens quick-assign dialog
+----------+
| Not      |  <- Shows "Assign CSC" button on hover
| Assigned |
+----------+
```

### Quick-Assign Dialog
```
+--------------------------------+
| Assign CSC to [Tenant Name]    |
+--------------------------------+
| [Avatar] Angela Connell-Richards  [*] Primary
| [Avatar] Sarah Smith
| [Avatar] John Doe
|                                |
| [Clear Assignment]   [Cancel]  |
+--------------------------------+
```

---

## Permission Model

| Action | SuperAdmin | Team Leader | Team Member | Client Admin |
|--------|------------|-------------|-------------|--------------|
| View CSC | Yes | Yes | Yes | Yes |
| Assign CSC | Yes | Yes | No | No |
| Remove CSC | Yes | No | No | No |

---

## Data Flow

```text
1. ManageTenants loads
   -> Queries tenant_csc_assignments (is_primary = true)
   -> Joins with users table for name/avatar
   -> Displays in CSC column

2. User clicks CSC cell
   -> Opens CSCQuickAssignDialog
   -> Fetches get_csc_users() for available CSCs
   -> User selects new CSC
   -> Calls admin_set_tenant_csc_assignment RPC
   -> Invalidates query cache
   -> UI updates immediately

3. ClientDetail loads
   -> useTenantCSCAssignment fetches current assignment
   -> CSCAssignmentSelector shows current CSC
   -> SuperAdmin changes assignment via dropdown
   -> RPC updates database
   -> Audit event logged automatically
```

---

## Technical Notes

### RPC Parameters (Existing)
```typescript
// admin_set_tenant_csc_assignment
{
  p_tenant_id: number,      // The client tenant ID
  p_csc_user_id: string,    // UUID of the CSC user
  p_is_primary: boolean,    // Whether this is the primary CSC (default true)
  p_role_label: string      // Label like "CSC" or "Client Success Champion"
}

// admin_remove_tenant_csc_assignment
{
  p_tenant_id: number,
  p_csc_user_id: string
}

// get_csc_users returns
[{ user_uuid, first_name, last_name, email, job_title, avatar_url }]
```

### User Eligibility
Users must have `is_csc = true` in the users table to appear in the CSC selection list. This is managed via the Team Users admin panel where SuperAdmins can mark users as CSCs.

---

## Validation Checklist

| Scenario | Expected Result |
|----------|-----------------|
| View client with no CSC assigned | Shows "Not Assigned" with assign button |
| SuperAdmin assigns CSC | CSC saved, appears in header and list |
| Team Leader assigns CSC | CSC saved successfully |
| Team Member tries to assign | Controls disabled, view-only |
| CSC removed from client | Shows "Not Assigned" again |
| View as Client Admin | CSC visible but no edit controls |
| Quick-assign from list | Dialog opens, selection persists |
