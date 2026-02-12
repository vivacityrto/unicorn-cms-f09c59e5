

## Replace "Add Company Rock" Button with a Rock Type Selector

### What Changes
The current "Add Company Rock" button will be replaced with a dropdown menu that lets users choose which type of Rock to create: **Company**, **Team**, or **Individual**.

### How It Works
- The button label changes to **"Add Rock"**
- Clicking it reveals a dropdown with three options:
  - **Company Rock** (with Building icon)
  - **Team Rock** (with Users icon)
  - **Individual Rock** (with User icon)
- Selecting an option opens the corresponding dialog that already exists in the codebase

### Visual Behaviour
- The dropdown will use the existing `DropdownMenu` component from the UI library
- Each option will have an icon and label for clarity
- The dropdown background will be solid (not transparent) with a high z-index

### Technical Details

**File: `src/pages/EosRocks.tsx`**

1. Add imports for `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` and `ChevronDown` icon
2. Replace the single `Button` in the `PageHeader` actions with a `DropdownMenu` containing three `DropdownMenuItem` entries:
   - "Company Rock" -- sets `showCompanyDialog(true)`
   - "Team Rock" -- sets `showTeamDialog(true)`
   - "Individual Rock" -- sets `showIndividualDialog(true)`
3. No changes to any dialog components -- all three (`CreateCompanyRockDialog`, `CreateTeamRockDialog`, `CreateIndividualRockDialog`) are already imported and wired up in this page

**No database, edge function, or other file changes required.**

