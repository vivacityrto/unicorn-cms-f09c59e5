
# Enforce EOS Visibility Using Current User Levels

## Analysis Summary

The navigation structure is mostly correct, but there are gaps in:
1. Missing EOS modules in the navigation (Accountability Chart, Processes)
2. Missing action permissions in the RBAC hook
3. Inconsistent permission checks on EOS pages

## Current User Levels (Source of Truth)

| Context | Valid Roles |
|---------|-------------|
| Vivacity Team | Super Admin, Team Leader, Team Member |
| Client Tenant | Admin, User |

## Implementation Plan

### Phase 1: Update EOS Navigation to Include All Modules

**File: `src/components/DashboardLayout.tsx`**

Update the shared `eosMenuItems` array to include all 11 EOS modules:

```typescript
const eosMenuItems = [
  { icon: Target, label: "EOS Overview", path: "/eos" },
  { icon: BarChart3, label: "Scorecard", path: "/eos/scorecard" },
  { icon: Flag, label: "Mission Control", path: "/eos/vto" },
  { icon: TrendingUp, label: "Rocks", path: "/eos/rocks" },
  { icon: Rocket, label: "Flight Plan", path: "/eos/flight-plan" },
  { icon: Shield, label: "Risks & Opportunities", path: "/eos/risks-opportunities" },
  { icon: ListTodo, label: "To-Dos", path: "/eos/todos" },
  { icon: Calendar, label: "Meetings", path: "/eos/meetings" },
  { icon: Users, label: "Quarterly Conversations", path: "/eos/qc" },
  { icon: Briefcase, label: "Accountability Chart", path: "/eos/accountability" },
  { icon: FileText, label: "Processes", path: "/processes" },
];
```

Update all menu configs to use the same array (no custom EOS array for SuperAdmin).

### Phase 2: Add Missing Route for Accountability Chart

**File: `src/App.tsx`**

Add route for Accountability Chart page:

```typescript
<Route 
  path="/eos/accountability" 
  element={
    <ProtectedRoute>
      <EosAccountabilityChart />
    </ProtectedRoute>
  } 
/>
```

**File: `src/pages/EosAccountabilityChart.tsx`** (New)

Create a placeholder page with appropriate structure.

### Phase 3: Expand RBAC Permissions

**File: `src/hooks/useRBAC.tsx`**

Add new permissions for EOS actions:

```typescript
export type Permission = 
  | 'administration:access'
  | 'advanced_features:access'
  | 'vto:edit'
  | 'eos_meetings:schedule'
  | 'eos_meetings:edit'
  | 'qc:schedule'
  | 'qc:edit'
  | 'qc:view_all'
  // New permissions
  | 'rocks:create'
  | 'rocks:edit_own'
  | 'rocks:edit_others'
  | 'risks:create'
  | 'risks:escalate'
  | 'risks:close_critical'
  | 'agenda_templates:manage';
```

Update role permission mappings per the specification:

| Permission | Super Admin | Team Leader | Team Member | Admin | User |
|------------|-------------|-------------|-------------|-------|------|
| rocks:create | Yes | Yes | Yes | Yes | Yes |
| rocks:edit_own | Yes | Yes | Yes | Yes | Yes |
| rocks:edit_others | Yes | Yes | No | Yes | No |
| risks:create | Yes | Yes | Yes | Yes | Yes |
| risks:escalate | Yes | Yes | No | Yes | No |
| risks:close_critical | Yes | No | No | No | No |
| eos_meetings:schedule | Yes | Yes | No | Yes | No |
| agenda_templates:manage | Yes | No | No | Yes | No |
| qc:sign | Yes | Yes | Yes | Yes | Yes |

Add helper functions:

```typescript
const canCreateRocks = (): boolean => hasPermission('rocks:create');
const canEditOwnRocks = (): boolean => hasPermission('rocks:edit_own');
const canEditOthersRocks = (): boolean => hasPermission('rocks:edit_others');
const canEscalateRisks = (): boolean => hasPermission('risks:escalate');
const canCloseCriticalRisks = (): boolean => hasPermission('risks:close_critical');
const canManageAgendaTemplates = (): boolean => hasPermission('agenda_templates:manage');
```

### Phase 4: Apply Permission Checks to EOS Pages

**File: `src/pages/EosRocks.tsx`**

Wrap "Add Rock" button and edit actions with permission checks:

```typescript
const { canCreateRocks, canEditOwnRocks, canEditOthersRocks } = useRBAC();
const { user } = useAuth();

// Add Rock button - visible to all who can create
{canCreateRocks() && (
  <Button onClick={() => { setEditingRock(null); setIsFormOpen(true); }}>
    <Plus className="w-4 h-4 mr-2" />
    Add Rock
  </Button>
)}

// Edit button - check ownership
const canEditRock = (rock: any) => {
  if (canEditOthersRocks()) return true;
  if (canEditOwnRocks() && rock.owner_user_id === user?.id) return true;
  return false;
};
```

**File: `src/pages/EosRisksOpportunities.tsx`**

Add permission checks for escalation and closing critical items:

```typescript
const { canEscalateRisks, canCloseCriticalRisks } = useRBAC();

// In status change dropdown
{canEscalateRisks() && (
  <SelectItem value="Escalated">Escalated</SelectItem>
)}

// For closing critical items
{item.impact === 'Critical' && !canCloseCriticalRisks() && (
  <p className="text-xs text-muted-foreground">
    Closing critical items requires Super Admin access.
  </p>
)}
```

**File: `src/pages/EosMeetings.tsx`** (Already correct)

Verify existing `canScheduleMeetings()` usage is sufficient.

### Phase 5: Add Disabled Action Guidance

When a user lacks permission for an action, show a disabled state with guidance rather than hiding the control.

```typescript
// Example pattern for disabled buttons
<Button 
  disabled={!canEscalateRisks()}
  title={!canEscalateRisks() ? "Escalation requires Admin access" : undefined}
>
  Escalate
</Button>
```

### Phase 6: Add Client Role Permission Mapping

Update `ROLE_PERMISSIONS` to include Admin and User roles:

```typescript
'Admin': [
  'rocks:create',
  'rocks:edit_own',
  'rocks:edit_others',
  'risks:create',
  'risks:escalate',
  'eos_meetings:schedule',
  'eos_meetings:edit',
  'agenda_templates:manage',
  'qc:schedule',
  'qc:edit',
  'qc:view_all',
],
'User': [
  'rocks:create',
  'rocks:edit_own',
  'risks:create',
],
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/DashboardLayout.tsx` | Modify | Add Accountability Chart and Processes to shared EOS menu |
| `src/hooks/useRBAC.tsx` | Modify | Add new permissions and role mappings |
| `src/pages/EosRocks.tsx` | Modify | Add permission checks for create/edit actions |
| `src/pages/EosRisksOpportunities.tsx` | Modify | Add permission checks for escalate/close actions |
| `src/pages/EosAccountabilityChart.tsx` | Create | Placeholder page for Accountability Chart |
| `src/App.tsx` | Modify | Add route for /eos/accountability |

---

## Validation Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Vivacity Team Member logs in | Sees full EOS sidebar (11 items) |
| Client User logs in | Sees identical EOS sidebar |
| Client User tries to escalate Risk | Action disabled with guidance message |
| Super Admin closes Critical Risk | Action succeeds |
| Team Leader schedules meeting | Action disabled (per spec) |
| Admin schedules meeting | Action succeeds |
| User edits their own Rock | Action succeeds |
| User edits another's Rock | Action disabled |

---

## Non-Breaking Changes

This implementation:
- Does not change database schema
- Does not modify RLS policies
- Only adds frontend permission gates
- Maintains backward compatibility with existing data
