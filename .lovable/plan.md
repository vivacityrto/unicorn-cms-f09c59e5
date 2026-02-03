
# Add Role Explanation Tooltips and Action Guidance Across EOS

## Overview

This plan adds role-aware guidance across all EOS modules to reduce user confusion when actions are disabled. The implementation follows the core principle: "Never hide capability without explaining it."

## Current State Analysis

### Existing Patterns
- **RBAC Hook** (`useRBAC.tsx`): Defines permission checks for all EOS actions
- **Existing Tooltips**: Some pages (EosMeetings, EosVto) now have basic tooltips from the previous implementation
- **Inline Guidance**: EosRisksOpportunities has partial inline text for critical risk restrictions

### Gaps Identified
1. Most disabled buttons show basic `title` attributes, not proper tooltips with role context
2. No reusable component for consistent permission denial messaging
3. No Role Reference page for users to understand permissions
4. No audit logging for restricted action attempts
5. Inconsistent messaging across EOS pages

## Implementation Plan

### Phase 1: Create Reusable Permission Guidance Components

**New File: `src/components/eos/PermissionTooltip.tsx`**

A wrapper component that:
- Shows a tooltip on disabled buttons explaining the restriction
- Displays current user role vs required role
- Suggests next steps (e.g., "Contact your Admin")

```text
Example output:
+-----------------------------------------+
| This action requires Admin access       |
| Your role: User                         |
|                                         |
| Contact your organisation admin         |
| to request this permission.             |
+-----------------------------------------+
```

**New File: `src/components/eos/RoleInfoPanel.tsx`**

A reusable panel/popover component that:
- Shows current user's role and context (Vivacity Team vs Client)
- Lists what the role CAN do in EOS
- Lists what the role CANNOT do
- Can be triggered from info icons or "Why can't I do this?" links

### Phase 2: Add Role Reference Page

**New File: `src/pages/RoleReference.tsx`**

Read-only reference page at `/settings/roles` containing:

| Section | Content |
|---------|---------|
| Vivacity Team Roles | Super Admin, Team Leader, Team Member with permissions |
| Client Tenant Roles | Admin, User with permissions |
| EOS Permissions Matrix | Table showing which roles can do what |

**Route Addition in `App.tsx`:**
```tsx
<Route 
  path="/settings/roles" 
  element={
    <ProtectedRoute>
      <RoleReference />
    </ProtectedRoute>
  } 
/>
```

### Phase 3: Update EOS Pages with Consistent Tooltips

Each EOS page will be updated to use the new PermissionTooltip component:

| Page | Actions to Wrap | Required Permission |
|------|-----------------|---------------------|
| `EosRocks.tsx` | Add Rock, Edit Rock (others) | `rocks:create`, `rocks:edit_others` |
| `EosFlightPlan.tsx` | Edit sections (inherited from VTO) | `vto:edit` |
| `EosMeetings.tsx` | Schedule, Manage Templates (done) | `eos_meetings:schedule` |
| `EosVto.tsx` | Edit Plan (done) | `vto:edit` |
| `EosRisksOpportunities.tsx` | Add Item, Escalate, Close Critical | `risks:create`, `risks:escalate`, `risks:close_critical` |
| `EosQC.tsx` | Schedule QC | `qc:schedule` |
| `EosTodos.tsx` | Add To-Do, Edit | Role-based |
| `Processes.tsx` | Add Process, Edit, Archive | Role-based |
| `EosAccountabilityChart.tsx` | Add/Assign seats (future) | Admin only |
| `EosScorecard.tsx` | Add Metric | Role-based |

### Phase 4: Meeting-Specific Guidance

**Updates to Live Meeting Components:**
- `FacilitatorSelectDialog.tsx`: Add tooltip explaining only facilitator can control segments
- `MeetingCloseValidationDialog.tsx`: Add guidance on who can close meetings
- `FinaliseMinutesDialog.tsx`: Add tooltip for finalise restrictions

**QC Session Updates:**
- `EosQCSession.tsx`: Add section headers explaining manager-only vs reviewee sections
- Signature areas: Add guidance on who can sign

### Phase 5: Lightweight Audit Logging

**New Database Migration:**
```sql
CREATE TABLE public.audit_restricted_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  tenant_id bigint REFERENCES public.tenants(id),
  action_attempted text NOT NULL,
  permission_required text,
  user_role text,
  page_path text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_restricted_actions ENABLE ROW LEVEL SECURITY;

-- Staff can read for analytics
CREATE POLICY "Staff can view restricted action logs"
  ON public.audit_restricted_actions FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- System can insert via RPC
CREATE POLICY "Allow insert for authenticated users"
  ON public.audit_restricted_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

**New Hook: `src/hooks/useRestrictedActionLog.tsx`**
- Logs when user clicks a disabled action
- Used for analytics to identify friction hotspots
- Debounced to prevent spam

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/eos/PermissionTooltip.tsx` | Reusable tooltip wrapper for disabled actions |
| `src/components/eos/RoleInfoPanel.tsx` | Panel showing role capabilities |
| `src/pages/RoleReference.tsx` | Read-only role reference page |
| `src/hooks/useRestrictedActionLog.tsx` | Hook for logging restriction attempts |
| Migration file | Create `audit_restricted_actions` table |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/EosRocks.tsx` | Wrap Add/Edit buttons with PermissionTooltip |
| `src/pages/EosFlightPlan.tsx` | Add edit restriction tooltips |
| `src/pages/EosRisksOpportunities.tsx` | Upgrade inline text to proper tooltips |
| `src/pages/EosQC.tsx` | Wrap Schedule QC button |
| `src/pages/EosTodos.tsx` | Add permission tooltips to actions |
| `src/pages/Processes.tsx` | Add tooltips to restricted actions |
| `src/pages/EosScorecard.tsx` | Wrap Add Metric button |
| `src/pages/EosAccountabilityChart.tsx` | Add governance restriction tooltips |
| `src/hooks/useRBAC.tsx` | Add helper to get user's role display name |
| `src/App.tsx` | Add route for `/settings/roles` |

## Technical Details

### PermissionTooltip Component API

```tsx
interface PermissionTooltipProps {
  permission: Permission;
  children: React.ReactNode;
  action?: string; // e.g., "schedule meetings"
  logAttempt?: boolean; // Whether to log clicks on disabled state
}

// Usage:
<PermissionTooltip permission="rocks:edit_others" action="edit other users' rocks">
  <Button disabled={!canEditOthersRocks()} onClick={handleEdit}>
    Edit Rock
  </Button>
</PermissionTooltip>
```

### Role Display Name Mapping

```tsx
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'Super Admin': 'Super Admin',
  'Team Leader': 'Team Leader',
  'Team Member': 'Team Member',
  'Admin': 'Admin',
  'User': 'General User',
  'General User': 'General User',
};

const PERMISSION_REQUIRED_ROLE: Record<Permission, string[]> = {
  'rocks:create': ['All roles'],
  'rocks:edit_others': ['Super Admin', 'Team Leader', 'Admin'],
  'risks:escalate': ['Super Admin', 'Team Leader', 'Admin'],
  'risks:close_critical': ['Super Admin only'],
  'eos_meetings:schedule': ['Super Admin', 'Team Leader', 'Admin'],
  'vto:edit': ['Super Admin', 'Team Leader', 'Team Member', 'Admin'],
  // ... etc
};
```

## Validation Checklist

1. Log in as User (lowest-permission client role)
2. Navigate to each EOS page
3. Verify disabled actions show tooltip with:
   - Required role
   - Current user role
   - Next step guidance
4. Verify no EOS pages disappear for any role
5. Verify role names are context-appropriate (no "Team Member" shown to clients)
6. Access `/settings/roles` and verify content is accurate
7. Check audit_restricted_actions table captures attempts

## Outcome

- Users understand the system faster
- Fewer "why can't I..." support tickets
- EOS feels transparent and intentional
- Analytics identify permission friction hotspots
- Training dependency reduced via Role Reference page
