
# Align User Types, Roles, and EOS Access Model

## Current State Analysis

### User Contexts and Existing Roles

| Context | Role in DB (`unicorn_role`) | User Type | Description |
|---------|----------------------------|-----------|-------------|
| Vivacity Team | `Super Admin` | `Vivacity` / `Vivacity Team` | Full platform admin |
| Vivacity Team | `Team Leader` | `Vivacity Team` | Internal staff, no admin access |
| Vivacity Team | `Team Member` | `Vivacity Team` | Internal staff, limited actions |
| Client Tenant | `Admin` | `Client Parent` | Client organization admin |
| Client Tenant | `User` | `Client Child` / `Client` | Client staff |

### Current EOS Sidebar

All users see the same 11 EOS menu items (per `eosMenuItems` in `DashboardLayout.tsx`):
- EOS Overview, Scorecard, Mission Control, Rocks, Flight Plan, Risks & Opportunities, To-Dos, Meetings, Quarterly Conversations, Accountability Chart, Processes

This is correct and aligns with the visibility-vs-authority standard.

### Current Permission Enforcement

The `useRBAC` hook (`src/hooks/useRBAC.tsx`) defines action-level permissions correctly, but has some inconsistencies with the prompt requirements:

| Permission | Super Admin | Team Leader | Team Member | Admin | User |
|------------|-------------|-------------|-------------|-------|------|
| `vto:edit` | Yes | Yes | Yes | Yes | No |
| `eos_meetings:schedule` | Yes | Yes | No | Yes | No |
| `eos_meetings:edit` | Yes | Yes | No | Yes | No |
| `rocks:create` | Yes | Yes | Yes | Yes | Yes |
| `rocks:edit_own` | Yes | Yes | Yes | Yes | Yes |
| `rocks:edit_others` | Yes | Yes | No | Yes | No |
| `risks:create` | Yes | Yes | Yes | Yes | Yes |
| `risks:escalate` | Yes | Yes | No | Yes | No |
| `risks:close_critical` | Yes | No | No | No | No |
| `agenda_templates:manage` | Yes | No | No | Yes | No |
| `qc:sign` | Yes | Yes | Yes | Yes | Yes |

## Issues Identified

### 1. Invite Flow: Hardcoded Role on Accept

In `AcceptInvitation.tsx` (line 200), the role is derived from user type context rather than from the stored `unicorn_role` in the invitation:

```tsx
unicorn_role: invitationData!.userType === 'vivacity' ? 'Super Admin' : 'User',
```

This means:
- Vivacity Team Leader invited as "Team Leader" gets assigned "Super Admin" on signup
- Client Admin invited as "Admin" gets assigned "User" on signup

The invitation's `unicorn_role` field is already populated correctly by the invite flow, but is not being passed to the signup.

### 2. Permission Mapping Gaps

The prompt specifies Team Leader should be able to:
- Close Critical Risks: No (current: No) - CORRECT
- Agenda Templates: No (current: No) - CORRECT

But Team Member should:
- Facilitate Meetings: No - CORRECT (no `eos_meetings:schedule`)
- Sign Quarterly Conversations: Yes - CORRECT

These are aligned.

### 3. Disabled Action Tooltips

Current implementation shows inline text guidance for restricted actions (line 525-527 in `EosRisksOpportunities.tsx`):

```tsx
{item.impact === 'Critical' && !canCloseCriticalRisks() && item.status !== 'Closed' && item.status !== 'Solved' && (
  <p className="text-xs text-muted-foreground">
    Closing critical items requires Super Admin access.
```

This pattern should be applied consistently across all restricted actions.

## Implementation Plan

### Phase 1: Fix Invite Acceptance Flow

**File: `src/pages/AcceptInvitation.tsx`**

Update the invitation data state and signup metadata to use the role from the invitation instead of deriving it from context:

1. Add `unicorn_role` to the `invitationData` state interface
2. Store the invited role from `data.unicorn_role` when validating token
3. Pass the actual `unicorn_role` from the invitation to the signup options:

```tsx
// Line 19-26: Add unicorn_role to state
const [invitationData, setInvitationData] = useState<{
  email: string;
  tenantId: number | null;
  userType: 'vivacity' | 'client';
  tenantName: string | null;
  firstName: string | null;
  lastName: string | null;
  unicornRole: string;  // ADD THIS
} | null>(null);

// Line 95-102: Store the role
setInvitationData({
  email: data.email,
  tenantId: data.tenant_id,
  userType: isVivacity ? 'vivacity' : 'client',
  tenantName,
  firstName: data.first_name || null,
  lastName: data.last_name || null,
  unicornRole: data.unicorn_role,  // ADD THIS
});

// Line 200-201: Use stored role
unicorn_role: invitationData!.unicornRole,
user_type: invitationData!.userType === 'vivacity' ? 'Vivacity Team' : 'Client',
```

### Phase 2: Update accept_invitation_v2 RPC

**File: New migration**

The RPC needs to also update the `unicorn_role` on the users table when accepting an invitation, not just the tenant membership:

```sql
-- Update users table with tenant_id AND unicorn_role
UPDATE public.users
SET 
  tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
  unicorn_role = v_invitation.unicorn_role,
  updated_at = now()
WHERE user_uuid = p_user_id;
```

### Phase 3: Ensure Consistent Permission Tooltips

**Pattern to apply across EOS pages:**

For restricted actions, use disabled button state with tooltip guidance:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

// Example pattern:
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Button
          disabled={!canScheduleMeetings()}
          onClick={handleSchedule}
        >
          Schedule Meeting
        </Button>
      </span>
    </TooltipTrigger>
    {!canScheduleMeetings() && (
      <TooltipContent>
        Scheduling meetings requires Admin access.
      </TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

Pages to audit and update with this pattern:
- `EosMeetings.tsx` - Schedule Meeting button
- `EosVto.tsx` - Edit Mission Control button
- `EosRocks.tsx` - Edit others' rocks
- `EosRisksOpportunities.tsx` - Escalate button, Close Critical status (partially done)

## Database Changes

### Migration: Fix accept_invitation_v2

```sql
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_tenant_role text;
  v_user_exists boolean;
BEGIN
  -- [existing validation logic...]
  
  -- Map invitation unicorn_role to tenant_members role
  v_tenant_role := CASE v_invitation.unicorn_role
    WHEN 'Super Admin' THEN 'Admin'
    WHEN 'Team Leader' THEN 'Admin'
    WHEN 'Team Member' THEN 'Admin'
    WHEN 'Admin' THEN 'Admin'
    WHEN 'General User' THEN 'General User'
    WHEN 'User' THEN 'General User'
    ELSE 'General User'
  END;

  -- [existing tenant_members insert...]

  -- Update users table with tenant_id AND unicorn_role from invitation
  UPDATE public.users
  SET 
    tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
    unicorn_role = v_invitation.unicorn_role,
    updated_at = now()
  WHERE user_uuid = p_user_id;

  -- [rest of function...]
END;
$$;
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/AcceptInvitation.tsx` | Pass invitation's `unicorn_role` to signup, not derived role |
| New migration SQL | Update `accept_invitation_v2` to sync `unicorn_role` on users table |
| `src/pages/EosMeetings.tsx` | Add tooltip to Schedule button when disabled |
| `src/pages/EosVto.tsx` | Add tooltip to Edit button when disabled |

## Validation Checklist

1. Invite a Team Leader -> Accept -> Verify `unicorn_role = 'Team Leader'` in users table
2. Invite a Client Admin -> Accept -> Verify `unicorn_role = 'Admin'` in users table
3. Login as Team Leader -> Verify EOS sidebar shows all 11 modules
4. Login as Team Member -> Attempt to schedule meeting -> See disabled button with tooltip
5. Login as Client User -> Attempt to edit others' rock -> See disabled button with guidance
6. Switch tenant context -> Verify sidebar remains consistent

## Summary

This plan aligns the user type, role, and EOS access model by:

1. **Fixing the invite flow** to preserve the invited role through signup
2. **Updating the RPC** to sync the role to the users table
3. **Adding tooltip guidance** for disabled actions across EOS pages
4. **Maintaining the existing visibility model** where all EOS pages are visible but actions are permission-gated
