

# Fix: Package Assignments Showing Wrong Stage Names

## Problem

The `GovernancePackageAssignments` component queries the **wrong table** for stage names.

- `stage_documents.stage_id` references `documents_stages.id` (per the foreign key)
- But the component fetches names from the `stages` table instead
- `documents_stages` and `stages` are **separate tables** with different IDs and column names (`title` vs `name`)
- This causes stage IDs to match wrong rows, displaying incorrect stage names

## Fix

**File: `src/components/governance/GovernancePackageAssignments.tsx`**

1. Change stage name query from `stages` to `documents_stages`
2. Change the column from `name` to `title` (which is what `documents_stages` uses)
3. Also update the `package_stages` query — its `stage_id` FK also references `documents_stages`

Additionally, restructure the display to group by **stage first** (with packages as secondary), as previously discussed:

- Each row shows the **stage name** as primary text
- Associated **packages** shown as badges next to the stage
- Rename card title to "Stage & Package Assignments"

## Technical detail

```text
Current (broken):
  stage_documents.stage_id → documents_stages.id
  but queries: stages.id, stages.name  ← WRONG TABLE

Fixed:
  stage_documents.stage_id → documents_stages.id
  queries: documents_stages.id, documents_stages.title  ← CORRECT
```

Single file change: `src/components/governance/GovernancePackageAssignments.tsx`

