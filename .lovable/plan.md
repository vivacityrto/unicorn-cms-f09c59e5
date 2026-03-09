
## Fix: EOS Scorecard Owner Dropdown to Show Only Current Vivacity Team

### Problem
The Owner dropdown in MetricEditorDialog is using `useTenantTeamUsers()` which includes all tenant users (clients). For EOS scorecard metrics, only current Vivacity Team members should be selectable as owners.

### Solution
Change MetricEditorDialog to use `useVivacityTeamUsers()` hook instead, which specifically filters for:
- Super Admin, Team Leader, Team Member roles only
- Active users (`archived = false`, `disabled = false`)
- Vivacity internal team only

### File Changes

**`src/components/eos/MetricEditorDialog.tsx`**:
- Replace `useTenantTeamUsers()` import with `useVivacityTeamUsers()`
- Update the hook call from `const { data: teamUsers = [] } = useTenantTeamUsers();` to `const { data: teamUsers = [] } = useVivacityTeamUsers();`
- No other changes needed - the rest of the component logic remains the same

### Why This Approach
- `useVivacityTeamUsers()` already exists and is purpose-built for this use case
- It's used correctly in `TaskAssigneeButton.tsx` for similar functionality
- Maintains consistency with EOS being Vivacity-internal only
- No database changes needed
