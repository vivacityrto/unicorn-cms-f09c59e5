

# Enhanced Package & Phase Management with Notes and Time Tracking

## Overview

This plan enhances the package and phase display to include:
1. **Status Date** - Automatically recorded when status changes
2. **Completion Date** - Manually editable via calendar picker
3. **Phase Comment** - Text field for phase-level notes
4. **Notes Integration** - Show/add/edit notes linked to the package
5. **Time Tracking** - Log and view time against the package

## Visual Mockups

### Option A: Integrated Tabs Layout (Recommended)

This design adds a tabbed interface within each expanded package that includes Phases, Notes, and Time sections.

```text
+===========================================================================+
| [icon] MTC Membership - Coaching      [Active]  [Start Package] [Add Pkg] |
+===========================================================================+
| Started: 1 Jan 2025     |  12.5/20 hrs used  |  Phase Progress: 3/8 (38%) |
| Current Phase: PD       |  [!] Has blocked phases                         |
+---------------------------------------------------------------------------+
|                                                                           |
| [Phases]  [Notes (12)]  [Time Log]                    [Manage Phases v]   |
+---------------------------------------------------------------------------+
| PHASES TAB CONTENT (when Phases selected):                                |
|                                                                           |
| +-----------------------------------------------------------------------+ |
| | [>] [o] Setup Phase                                                   | |
| |         Status changed: 2 Feb 2026 14:30     [Complete v]             | |
| +-----------------------------------------------------------------------+ |
| | [v] [o] PD Phase                             [💬] [In Progress v]     | |
| +-----------------------------------------------------------------------+ |
| |   +------ PHASE DETAILS -----------------------------------------+    | |
| |   | Completion Date: [📅 19 Feb 2026    ]                        |    | |
| |   |                                                               |    | |
| |   | Comment:                                                      |    | |
| |   | +-----------------------------------------------------------+ |    | |
| |   | | Delayed due to trainer availability. Will resume after   | |    | |
| |   | | March training calendar is confirmed.                    | |    | |
| |   | +-----------------------------------------------------------+ |    | |
| |   |                                                               |    | |
| |   | [Save Details]                                                |    | |
| |   +---------------------------------------------------------------+    | |
| |                                                                        | |
| |   +------ STAFF TASKS (3/5 complete) ----------------------------------+ |
| |   | [x] Email trainer matrix         Due: 12 Feb   [Sam H] [Done v]   | |
| |   | [ ] Monitor PD uploads                         [Amy L] [Open v]   | |
| |   | [ ] Schedule review call                               [Open v]   | |
| |   +-------------------------------------------------------------------+ |
| +------------------------------------------------------------------------+|
| | [>] [o] Validation & Training                        [Not Started v]  | |
| +-----------------------------------------------------------------------+ |
| | [>] [!] Review                                       [Blocked v]      | |
| +-----------------------------------------------------------------------+ |
+===========================================================================+
```

### Notes Tab Content (when Notes selected)

```text
+---------------------------------------------------------------------------+
| [Phases]  [Notes (12)]  [Time Log]                        [+ Add Note]    |
+---------------------------------------------------------------------------+
| NOTES TAB CONTENT:                                                        |
|                                                                           |
| Filter: [All Types v] [Package Notes Only v]                              |
|                                                                           |
| +-----------------------------------------------------------------------+ |
| | [📞] Phone Call                           [Package] [Pinned]          | |
| | "Discussed scope changes with training manager"                       | |
| | Tags: [scope] [training]                                              | |
| | 2 hours ago by Sam H                               [...] Edit/Delete  | |
| +-----------------------------------------------------------------------+ |
| | [📝] General Note                         [Package]                   | |
| | "Updated PD template based on feedback from review"                   | |
| | 1 day ago by Amy L                                 [...] Edit/Delete  | |
| +-----------------------------------------------------------------------+ |
| | [⚠️] Risk                                 [Package]                   | |
| | "Trainer availability may delay March deadlines"                      | |
| | Priority: High                                                         | |
| | 3 days ago by Sam H                                [...] Edit/Delete  | |
| +-----------------------------------------------------------------------+ |
+===========================================================================+
```

### Time Log Tab Content (when Time Log selected)

```text
+---------------------------------------------------------------------------+
| [Phases]  [Notes (12)]  [Time Log]        [Start Timer] [+ Log Time]      |
+---------------------------------------------------------------------------+
| TIME LOG TAB CONTENT:                                                     |
|                                                                           |
| This Week: 2h 30m  |  This Month: 8h 15m  |  Last 90 Days: 24h 45m       |
|                                                                           |
| Filter: [All Types v] [Billable v]                                        |
|                                                                           |
| +-----------------------------------------------------------------------+ |
| | 2 Feb 2026         | 45m        | Consultation | [Timer]   | [$]     | |
| | "PD review call with training manager"                                | |
| +-----------------------------------------------------------------------+ |
| | 1 Feb 2026         | 1h 30m     | Document Rev | [Manual]  | [$]     | |
| | "Reviewed updated trainer matrix"                                     | |
| +-----------------------------------------------------------------------+ |
| | 28 Jan 2026        | 15m        | Support      | [Timer]   |         | |
| | "Quick email response"                                                | |
| +-----------------------------------------------------------------------+ |
+===========================================================================+
```

### Option B: Side Panel Layout

Alternative design with a detail panel that slides in from the right:

```text
+=========================================================+==================+
| PACKAGE CARD                                            | DETAIL PANEL     |
+=========================================================+==================+
| [icon] MTC Membership                        [Active]   | [x] Close        |
+---------------------------------------------------------+------------------+
| [>] [o] Setup Phase              [Complete v]           | PHASE: PD        |
+---------------------------------------------------------|                  |
| [v] [o] PD Phase                 [In Progress v] [💬]   | STATUS           |
|   +-- Staff Tasks (3/5) --------------------------+     | Changed: 2 Feb   |
|   | [x] Email trainer matrix        [Done v]     |     |                  |
|   | [ ] Monitor PD uploads          [Open v]     |     | COMPLETION DATE  |
|   +-----------------------------------------------+     | [📅 19 Feb 2026] |
+---------------------------------------------------------|                  |
| [>] [o] Validation                [Not Started v]       | COMMENT          |
+---------------------------------------------------------| +------------+   |
| [>] [!] Review                    [Blocked v]           | | Delayed... |   |
+---------------------------------------------------------| +------------+   |
                                                          | [Save]           |
                                                          |                  |
                                                          | --- NOTES (3) ---|
                                                          | [+ Add Note]     |
                                                          | [Phone call...]  |
                                                          | [Risk note...]   |
                                                          |                  |
                                                          | --- TIME LOG --- |
                                                          | [+ Log Time]     |
                                                          | 45m - 2 Feb      |
                                                          | 1h30m - 1 Feb    |
+=========================================================+==================+
```

## Recommendation

**Option A (Integrated Tabs)** is recommended because:
- More screen space for content
- Familiar tab pattern already used in ClientDetail
- Notes and Time Log get dedicated full-width views
- Scales better on smaller screens
- Easier to add more tabs later (Client Tasks, Emails)

## Implementation Approach

### Phase 1: Phase Details (Status Date, Completion Date, Comment)

**Files to modify:**
- `src/components/client/PackageStagesManager.tsx` - Add detail section

**Changes:**
1. Add `status_date`, `completion_date`, `comment` to the query
2. Display `status_date` timestamp next to status dropdown
3. Add expandable detail section with:
   - Calendar picker for `completion_date`
   - Textarea for `comment`
   - Save button with audit logging
4. Auto-update `status_date` on status change
5. Show comment indicator icon when comment exists

### Phase 2: Package-Level Notes Tab

**Files to create:**
- `src/components/client/PackageNotesSection.tsx`

**Changes:**
1. Create component that wraps existing notes functionality
2. Filter notes by `parent_type = 'package_instance'` and `parent_id = package_instance.id`
3. Use existing `useNotes` hook with package_instance parent type
4. Match styling from `ClientStructuredNotesTab`
5. Support add/edit/delete with full audit logging

### Phase 3: Package-Level Time Log Tab

**Files to create:**
- `src/components/client/PackageTimeSection.tsx`

**Changes:**
1. Create component wrapping existing time tracking
2. Use `useTimeTracking` hook filtered by package_id
3. Show summary stats (This Week, This Month, Last 90 Days)
4. Display time entries table with filters
5. Include "Start Timer" and "Log Time" buttons

### Phase 4: Integration into ClientPackagesTab

**Files to modify:**
- `src/components/client/ClientPackagesTab.tsx`

**Changes:**
1. Replace simple collapsible with tabbed interface
2. Add three tabs: Phases, Notes, Time Log
3. Pass package instance ID to each section
4. Show badge counts for notes

## Technical Details

### Database Operations

**Fetch stage with new fields:**
```typescript
.select('id, stage_id, status, status_date, completion_date, comment, paid, released_client_tasks')
```

**Update status with timestamp:**
```typescript
const updateData = {
  status: newStatus,
  status_date: new Date().toISOString(),
  ...(newStatus === 3 && { completion_date: new Date().toISOString().split('T')[0] })
};
```

**Update phase details:**
```typescript
await supabase
  .from('stage_instances')
  .update({
    completion_date: selectedDate,
    comment: commentText
  })
  .eq('id', stageInstanceId);
```

### Notes Integration

Uses existing `useNotes` hook with:
```typescript
const { notes, createNote, updateNote, deleteNote } = useNotes({
  parentType: 'package_instance',
  parentId: packageInstanceId,
  tenantId: tenantId
});
```

### Time Tracking Integration

Uses existing `useTimeTracking` hook:
```typescript
const { entries, summary, startTimer, addTimeEntry } = useTimeTracking(clientId);
// Filter entries by package_id for display
const packageEntries = entries.filter(e => e.package_id === packageId);
```

### Audit Logging

All changes logged to `client_audit_log`:
```typescript
await supabase.from('client_audit_log').insert({
  tenant_id: tenantId,
  actor_user_id: profile?.user_uuid,
  action: 'stage_details_updated', // or 'note_added', 'time_logged'
  entity_type: 'stage_instances',
  entity_id: stageInstanceId.toString(),
  before_data: { completion_date: oldDate, comment: oldComment },
  after_data: { completion_date: newDate, comment: newComment },
  details: { package_id: packageId, stage_id: stageId }
});
```

## Component Structure

```text
ClientPackagesTab
  |
  +-- PackageCard (for each package)
        |
        +-- Tabs
              |
              +-- PhasesTab (PackageStagesManager)
              |     |
              |     +-- StageRow
              |           |
              |           +-- StageDetailSection (NEW)
              |           |     +-- Completion Date Picker
              |           |     +-- Comment Textarea
              |           |     +-- Save Button
              |           |
              |           +-- StageStaffTasks (existing)
              |
              +-- NotesTab (PackageNotesSection - NEW)
              |     +-- Uses useNotes hook
              |     +-- Note cards with CRUD
              |
              +-- TimeTab (PackageTimeSection - NEW)
                    +-- Uses useTimeTracking hook
                    +-- Summary stats
                    +-- Entry list
                    +-- Timer controls
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/client/PackageStagesManager.tsx` | Modify | Add status_date update, detail section |
| `src/components/client/StageDetailSection.tsx` | Create | Completion date and comment editing |
| `src/components/client/PackageNotesSection.tsx` | Create | Notes tab for package |
| `src/components/client/PackageTimeSection.tsx` | Create | Time log tab for package |
| `src/components/client/ClientPackagesTab.tsx` | Modify | Add tabbed interface |

## Expected Outcome

1. Phases display with status change timestamps
2. Completion dates can be manually set/edited
3. Comments can be added to phases with visual indicator
4. Notes can be viewed/added/edited at the package level
5. Time can be logged and tracked against packages
6. All actions are audit logged
7. Clean, familiar tabbed interface matching existing patterns

