

# Add Tag Filter to Notes Tab

## Overview
Add a tag filter alongside the existing "All Notes / Client Notes / Package Notes" filter so users can quickly narrow down notes by one or more tags from the `dd_note_tags` lookup table.

---

## What Changes

### 1. Add Tag Filter State (ClientStructuredNotesTab.tsx)

Add a new `selectedTagFilter` state (array of strings) next to the existing `parentTypeFilter` state at line 58.

### 2. Add Tag Filter Dropdown in the Header

Place a multi-select-style tag filter next to the existing parent type filter (around lines 259-272). This will be a `Popover` with checkboxes for each active tag from `dd_note_tags`, similar to common filter patterns. It will show:
- A trigger button with a `Tag` icon and count of selected tags (e.g., "Tags (2)")
- A popover listing all active tags as checkable items
- A "Clear" button to reset the filter

The `useNoteTags` hook is already imported and available in the component.

### 3. Apply Tag Filter to Notes List

Update the `filteredNotes` logic at line 225 to also filter by selected tags. A note matches if it contains **any** of the selected tags (OR logic), so selecting multiple tags widens the results.

### 4. Update Empty State Message

Adjust the empty state text (lines 281-295) to mention tag filters when active.

---

## Technical Details

### New State
```
const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
```

### Updated Filter Logic
```
const filteredNotes = notes
  .filter(note => parentTypeFilter === 'all' || note.parent_type === parentTypeFilter)
  .filter(note => selectedTagFilter.length === 0 || note.tags.some(t => selectedTagFilter.includes(t)));
```

### Tag Filter UI
A `Popover` component (already available via Radix) with a list of `Checkbox` items for each tag from `availableNoteTags`. The trigger shows a badge count when filters are active. Includes a "Clear all" action.

### Files Modified
| File | Change |
|------|--------|
| `src/components/client/ClientStructuredNotesTab.tsx` | Add tag filter state, popover UI, and updated filter logic |

### Imports Needed
- `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`
- `Checkbox` from `@/components/ui/checkbox`

No new files or database changes required -- this builds entirely on the existing `useNoteTags` hook and `dd_note_tags` table.

