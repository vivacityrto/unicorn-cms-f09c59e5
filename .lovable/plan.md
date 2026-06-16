## Plan: Add Note Type, Priority, and Package Filters to Structured Notes

Add three new filter controls — Note Type, Priority, and Package — to the filter bar in `ClientStructuredNotesTab`, alongside the existing parent type, tag, and date filters.

### Step 1 — State
Add three `useState` hooks near the existing `parentTypeFilter` state:
- `noteTypeFilter` (default `'all'`)
- `priorityFilter` (default `'all'`)
- `packageFilter` (default `'all'`)

### Step 2 — Filtering Logic
Extend `filteredNotes` to apply the new filters:
- `noteTypeFilter === 'all' || note.note_type === noteTypeFilter`
- `priorityFilter === 'all' || note.priority === priorityFilter`
- `packageFilter === 'all' || String(note.parent_id) === packageFilter`

### Step 3 — UI Controls (filter bar, after the existing parent type Select)
Three new dropdowns, conditional on `parentTypeFilter !== 'clickup'`:

- **Note Type Select**: options from `noteTypeOptions` (already fetched from `dd_note_types`). Default "All Types". Only rendered when `noteTypeOptions.length > 0`.
- **Priority Select**: fixed options — All, Urgent, High, Normal. Red dot next to Urgent, amber dot next to High.
- **Package Select**: options built from `packageNameMap` (already fetched). Default "All Packages". Only rendered when `parentTypeFilter !== 'tenant'`.

All use the existing `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` components.

### Step 4 — Clear Filters
Add a "Clear filters" text link at the end of the filter bar, visible when any of the three new filters is non-default. Click resets all three to `'all'`.

### No DB changes
All data (`noteTypeOptions`, `packageNameMap`, `notes`) is already loaded client-side.