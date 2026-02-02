
# Unify EOS Risks and Opportunities into a Master IDS

## Analysis Summary

After reviewing the codebase, the core unification is **already in place**. The `eos_issues` table serves as the single source of truth for all Risks and Opportunities. Meetings reference issues via `meeting_id` - they do not create separate storage.

However, there are critical gaps that must be addressed:

## Gap 1: Navigation Visibility (Critical)

**Problem**: Client Admin and User roles cannot see the EOS menu section at all.

**Current State**:
- `superAdminMenuItems` - Has EOS section (correct)
- `vivacityStaffMenuItems` - Has EOS section (correct)  
- `adminMenuItems` - **Missing EOS section** (broken)
- `userMenuItems` - **Missing EOS section** (broken)

**Fix Required**: Add the EOS menu section to `adminMenuItems` and `userMenuItems` so all tenant users can see the same EOS navigation.

## Gap 2: Source Field Values

**Problem**: The `source` column supports `ad_hoc` and `meeting_ids` but not the meeting type distinctions.

**Current Values**: ad_hoc, meeting_ids, ro_page
**Required Values**: Manual, Level 10, Quarterly, Annual

**Fix Required**: 
1. Add migration to update valid source values
2. Update form and display logic to handle meeting-type-based sources
3. Auto-set source based on meeting type when creating during meetings

## Gap 3: Missing Data Fields

**Required per specification**:
- `why_it_matters` - Currently missing
- `detailed_description` - Currently using `description` (can be aliased)

**Fix Required**: Add `why_it_matters` column to `eos_issues` and update form to capture it.

## Gap 4: Audit Traceability Display

**Problem**: The Risks & Opportunities page does not show:
- Where item was raised
- Which meeting surfaced it
- Status history

**Fix Required**: Enhance the R&O page to display source, linked meeting name, and add a history panel.

---

## Implementation Plan

### Phase 1: Fix Navigation Visibility

**File**: `src/components/DashboardLayout.tsx`

**Changes**:
Add EOS section to both `adminMenuItems` and `userMenuItems`:

```typescript
const adminMenuItems = {
  main: [...baseMenuItems],
  team: [{ /* existing */ }],
  eos: [
    { icon: Target, label: "EOS Overview", path: "/eos" },
    { icon: BarChart3, label: "Scorecard", path: "/eos/scorecard" },
    { icon: Flag, label: "Mission Control", path: "/eos/vto" },
    { icon: TrendingUp, label: "Rocks", path: "/eos/rocks" },
    { icon: Rocket, label: "Flight Plan", path: "/eos/flight-plan" },
    { icon: Shield, label: "Risks & Opportunities", path: "/eos/risks-opportunities" },
    { icon: ListTodo, label: "To-Dos", path: "/eos/todos" },
    { icon: Calendar, label: "Meetings", path: "/eos/meetings" },
    { icon: Users, label: "Quarterly Conversations", path: "/eos/qc" },
  ],
};

const userMenuItems = {
  main: [...baseMenuItems],
  eos: [
    { icon: Target, label: "EOS Overview", path: "/eos" },
    { icon: BarChart3, label: "Scorecard", path: "/eos/scorecard" },
    { icon: TrendingUp, label: "Rocks", path: "/eos/rocks" },
    { icon: Shield, label: "Risks & Opportunities", path: "/eos/risks-opportunities" },
    { icon: ListTodo, label: "To-Dos", path: "/eos/todos" },
    { icon: Calendar, label: "Meetings", path: "/eos/meetings" },
  ],
};
```

### Phase 2: Database Schema Updates

**Migration Required**:

```sql
-- Add why_it_matters column
ALTER TABLE eos_issues 
ADD COLUMN IF NOT EXISTS why_it_matters TEXT;

-- Update source enum values (if using CHECK constraint)
-- Note: source is currently TEXT, so we update the default and form logic only
```

### Phase 3: Update Form to Capture New Fields

**File**: `src/components/eos/RiskOpportunityForm.tsx`

**Changes**:
1. Add `why_it_matters` field to form data interface
2. Add textarea input for "Why It Matters"
3. Pass value through to hooks

```typescript
export interface RiskOpportunityFormData {
  // ... existing fields
  why_it_matters?: string;
}
```

Add field in form (after description):
```typescript
<div className="space-y-2">
  <Label>Why It Matters</Label>
  <Textarea 
    placeholder="What is the potential impact if this is ignored? Why should we address this?"
    value={formData.why_it_matters}
    onChange={(e) => setFormData({ ...formData, why_it_matters: e.target.value })}
    rows={2}
  />
</div>
```

### Phase 4: Update Hooks

**File**: `src/hooks/useRisksOpportunities.tsx`

**Changes**:
1. Add `why_it_matters` to insert and update operations
2. Include in select query (already fetches all columns)

### Phase 5: Update Display on R&O Page

**File**: `src/pages/EosRisksOpportunities.tsx`

**Changes**:
1. Display source badge (Manual, Level 10, Quarterly, Annual)
2. Show linked meeting name if `meeting_id` is present
3. Display `why_it_matters` in the card content

Add source badge logic:
```typescript
const getSourceLabel = (source?: string, meetingType?: string) => {
  if (source === 'ro_page' || source === 'ad_hoc') return 'Manual';
  if (source === 'meeting_ids') {
    if (meetingType === 'L10') return 'Level 10';
    if (meetingType === 'Quarterly') return 'Quarterly';
    if (meetingType === 'Annual') return 'Annual';
    return 'Meeting';
  }
  return source || 'Manual';
};
```

Display in card:
```typescript
{item.source && (
  <Badge variant="outline" className="text-xs">
    Source: {getSourceLabel(item.source)}
  </Badge>
)}
```

### Phase 6: Auto-Set Source in Meetings

**File**: `src/components/eos/CreateIssueDialog.tsx`

**Changes**:
Pass meeting type when creating issues so source can reflect the meeting type:

```typescript
source: context === 'meeting_ids' 
  ? `meeting_${meetingType?.toLowerCase() || 'ids'}`
  : 'ro_page',
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/DashboardLayout.tsx` | Modify | Add EOS menu to Admin and User roles |
| `src/components/eos/RiskOpportunityForm.tsx` | Modify | Add why_it_matters field |
| `src/hooks/useRisksOpportunities.tsx` | Modify | Include why_it_matters in mutations |
| `src/pages/EosRisksOpportunities.tsx` | Modify | Display source, meeting link, why_it_matters |
| `src/types/risksOpportunities.ts` | Modify | Add why_it_matters to type |
| Database Migration | Add | Add why_it_matters column |

---

## Validation Checklist

After implementation:

| Requirement | Status |
|------------|--------|
| Single `eos_issues` table for all R&O | Already correct |
| Meetings reference, not duplicate | Already correct |
| All tenant users see EOS navigation | Fix in Phase 1 |
| Items added anywhere update master page | Already correct |
| No role-based page hiding | Fix in Phase 1 |
| Source tracks origin (Manual, L10, Quarterly, Annual) | Fix in Phases 5-6 |
| why_it_matters field captured | Fix in Phases 2-4 |

---

## Security Notes

The existing RLS policies already enforce tenant isolation:
- `is_staff() OR is_super_admin() OR (tenant_id = get_current_user_tenant())`

All users within a tenant can see all issues for that tenant. This is already compliant with the requirement.

---

## Expected Outcome

1. All EOS users within a tenant will see the same EOS menu items
2. Risks & Opportunities page becomes the authoritative IDS register
3. Source tracking shows where each item was raised
4. New `why_it_matters` field captures impact justification
5. No changes to the underlying data architecture - it's already correct
