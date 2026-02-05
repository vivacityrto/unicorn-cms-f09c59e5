
# Vivacity Team Auth Account Enforcement and L10 Meeting Participation

## Summary
Ensure every Vivacity Team user (Super Admin, Team Leader, Team Member) has a corresponding auth account, and that Level 10 meetings always include all active Vivacity Team members as participants.

## Current State Analysis

### Existing Issues Found
- **2 orphan users without auth accounts:**
  - `admin@vivacity.com.au` (Admin User) - Team Member role
  - `jomar@vivacity.com.au` (Jomar Banlat) - Team Member role
- The `create_meeting_from_template` function already auto-populates L10 participants from `public.users` but doesn't verify auth account existence
- Role changes in ManageUsers.tsx use a direct database update without auth account validation

### What's Already Working
- Unique constraint on `eos_meeting_participants(meeting_id, user_id)` exists
- The `create_meeting_from_template` function correctly identifies L10 meetings and inserts all Vivacity Team users
- Invitation flow correctly creates auth accounts before public.users records

## Technical Changes

### 1. Database: Create Auth Account Verification Helper
Create a security definer function to check if a user has an auth account:

```text
+------------------------------------------------------------+
| public.has_auth_account(p_user_uuid uuid) -> boolean       |
+------------------------------------------------------------+
| Checks if the given UUID exists in auth.users              |
| SECURITY DEFINER - bypasses RLS for cross-schema lookup    |
+------------------------------------------------------------+
```

### 2. Database: Update create_meeting_from_template
Modify the L10 participant selection to only include users with valid auth accounts:

```text
Current:
  WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
    AND u.user_uuid IS NOT NULL

Updated:
  WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    AND u.archived = false
    AND u.user_uuid IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.user_uuid)
```

Add logging to track how many participants were added:

```text
RAISE NOTICE 'L10 meeting %: added % Vivacity Team participants', 
  v_meeting_id, 
  (SELECT count(*) FROM eos_meeting_participants WHERE meeting_id = v_meeting_id);
```

### 3. Database: Create L10 Participant Sync Function
Create a function to resync participants for existing or future L10 meetings:

```text
+--------------------------------------------------------------------+
| public.sync_l10_meeting_participants(p_meeting_id uuid) -> jsonb   |
+--------------------------------------------------------------------+
| Adds any missing Vivacity Team users (with auth accounts) to the   |
| specified L10 meeting. Returns count of added participants.        |
| Does NOT remove manually added participants.                       |
+--------------------------------------------------------------------+
```

This can be called:
- Manually by admins to fix existing meetings
- On a scheduled basis (nightly cron job via pg_cron)
- On meeting open/start

### 4. Frontend: Add Auth Account Validation to Role Change
Update `ManageUsers.tsx` to validate auth account exists before allowing Vivacity Team role assignment.

**File: `src/pages/ManageUsers.tsx`**

```text
Current flow:
  User selects role -> Confirmation dialog -> Direct database update

Updated flow:
  User selects Vivacity Team role (Super Admin/Team Leader/Team Member)
    -> Check if user has auth account via helper function
    -> If no auth account: Show error + "Send Invite" button
    -> If auth account exists: Show confirmation dialog -> Update role
```

Changes to `confirmRoleChange`:
```typescript
const confirmRoleChange = async () => {
  if (!roleChangeDialog) return;
  
  const isVivacityRole = ['Super Admin', 'Team Leader', 'Team Member']
    .includes(roleChangeDialog.newRole);
  
  if (isVivacityRole) {
    // Check auth account exists
    const { data: hasAuth } = await supabase.rpc('has_auth_account', {
      p_user_uuid: roleChangeDialog.userId
    });
    
    if (!hasAuth) {
      toast({
        title: 'Auth Account Required',
        description: 'This user must have an auth account for Vivacity Team roles. Send them an invite first.',
        variant: 'destructive'
      });
      setRoleChangeDialog(null);
      return;
    }
  }
  
  // Proceed with role update...
};
```

### 5. Frontend: Enhanced Role Change Dialog
Update the role change confirmation dialog to show a warning and action when auth account is missing:

```text
+--------------------------------------------------+
| Confirm Role Change                              |
+--------------------------------------------------+
| ⚠ Auth Account Required                          |
|                                                  |
| This user does not have an auth account.         |
| Vivacity Team roles require users to be able     |
| to log in.                                       |
|                                                  |
| [Send Invite]  [Cancel]                          |
+--------------------------------------------------+
```

### 6. Database: Clean Up Orphan Records (One-Time Fix)
Create a migration to either:
- Archive the 2 orphan users (admin@vivacity.com.au, jomar@vivacity.com.au), OR
- Send them invitations to create proper auth accounts

Recommended approach - archive orphans:
```sql
UPDATE public.users
SET archived = true, updated_at = now()
WHERE unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = user_uuid);
```

### 7. Optional: Nightly Sync Cron Job
Set up a scheduled job to ensure L10 meeting participants stay in sync:

```sql
SELECT cron.schedule(
  'sync-l10-participants',
  '0 3 * * *',  -- 3 AM daily
  $$
  -- Find all future L10 meetings and sync participants
  SELECT public.sync_l10_meeting_participants(id)
  FROM public.eos_meetings
  WHERE meeting_type ILIKE '%L10%'
    AND scheduled_date > now()
    AND status = 'scheduled';
  $$
);
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/migrations/[timestamp]_auth_account_enforcement.sql` | New | Helper functions and L10 participant sync |
| `supabase/migrations/[timestamp]_cleanup_orphan_vivacity_users.sql` | New | Archive users without auth accounts |
| `src/pages/ManageUsers.tsx` | Modified | Add auth account check before Vivacity role assignment |

## Testing Checklist

1. **Role Change Validation**
   - Try to change a user without auth account to Team Member - should show error
   - Try to change a user with auth account to Super Admin - should succeed

2. **L10 Meeting Participants**
   - Schedule a new L10 meeting
   - Verify all active Vivacity Team users with auth accounts are added
   - Verify orphan users (archived after cleanup) are NOT included

3. **Manual Sync**
   - Call `sync_l10_meeting_participants` on an existing meeting
   - Verify new team members are added, existing participants retained

4. **Data Integrity**
   - Verify the 2 orphan users are archived
   - Verify no duplicate participant rows exist (unique constraint)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Archiving active users | Query confirms only 2 orphans, neither appear to be active staff |
| Breaking existing L10 meetings | Sync function only ADDS missing users, never removes |
| Role change UX disruption | Clear error message with actionable "Send Invite" option |

## Done Criteria
- All Vivacity Team users in public.users have corresponding auth.users records
- Role changes to Vivacity Team roles validate auth account first
- L10 meetings auto-populate only users with valid auth accounts
- Orphan users without auth accounts are archived or have pending invitations
- No duplicate participant rows in any meeting
