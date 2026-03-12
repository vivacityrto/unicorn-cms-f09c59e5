

# Fix: Package Assignments Component

## Problem
`GovernancePackageAssignments` queries the empty `package_stage_documents` table, so no assignments appear.

## Correct Path (confirmed with live data)
```text
stage_documents (document_id, stage_id, delivery_type)
  → package_stages (stage_id → package_id)
  → packages (name)
  → stages (name)
```

## Change

**`src/components/governance/GovernancePackageAssignments.tsx`**

Replace the query function to:
1. Query `stage_documents` joined with `package_stages`, `packages`, and `stages` — all in one step
2. Filter by `document_id` and `is_active = true`
3. Map results to the existing `PackageAssignment` interface
4. Rest of component (grouping, rendering) unchanged

