

## Staff Task Type System with Action Button

### Overview
Add a task type indicator (derived from name prefixes like `EMAIL:`, `ADMIN:`, `OM:`) and an action button with a dropdown menu on each staff task row. This is a UI-only change with no database modifications.

### How It Works

**Type Detection**: Parse the task name prefix to determine the type:
- `EMAIL:` -- Email type (Mail icon, purple badge)
- `ADMIN:` -- Admin/procedural type (Settings icon, blue badge)
- `OM:` -- Operations Management type (Briefcase icon, amber badge)
- No prefix -- General task (default, no badge)

**Action Button**: A small button (e.g. `MoreHorizontal` or `Play` icon) on each task row that opens a dropdown menu. The available actions vary by type:
- **EMAIL type**: "Send Email", "Preview Email", "Mark as Sent"
- **ADMIN type**: "Open Procedure", "Create Folder" (if SharePoint-related), "Mark Done"
- **OM type**: "Notify CEO", "Assign CSC", "Mark Done"
- **All types**: "Mark Complete", "Add Note"

For now, the actions will show toast notifications indicating what would happen (placeholder), since the actual automation (sending emails, creating folders) requires separate backend work to wire up. This gives the UI structure to build on incrementally.

### Technical Changes

1. **New utility: `src/utils/staffTaskType.ts`**
   - `parseTaskType(name: string)` -- returns `{ type: 'email' | 'admin' | 'om' | 'general', cleanName: string }`
   - `getTaskTypeIcon(type)` -- returns the appropriate Lucide icon
   - `getTaskTypeBadgeStyle(type)` -- returns badge colour classes
   - `getActionsForType(type)` -- returns array of available action labels

2. **New component: `src/components/client/StaffTaskActionMenu.tsx`**
   - Renders a `DropdownMenu` triggered by an icon button
   - Lists actions based on task type from `getActionsForType()`
   - Each action fires a toast placeholder for now
   - Accepts `taskName`, `taskId`, `tenantId` props for future wiring

3. **Update: `src/components/client/StageStaffTasks.tsx`**
   - Import and use `parseTaskType` to extract type and clean name
   - Display a small coloured type badge (EMAIL, ADMIN, OM) next to the task name
   - Add `StaffTaskActionMenu` component to each task row (between the notes popover and status dropdown)
   - Show the clean name (without prefix) in the task label

### Visual Layout per Row (left to right)
```text
[Status Icon] [Type Badge] [Clean Task Name] [? Description] [Non-core badge] | [Avatar] [Notes] [Action Menu] [Status Dropdown]
```

