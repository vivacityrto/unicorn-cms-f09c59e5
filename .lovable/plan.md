

# Fix: Package Assignments — Use Instance Tables

## Problem

The component queries deprecated tables (`stage_documents`, `documents_stages`). The correct data path is through the **instance tables**:

```text
document_instances (document_id)
  → stage_instances (id = stageinstance_id)
    → stages (id = stage_id)              ← stage name
    → package_instances (id = packageinstance_id)
      → packages (id = package_id)        ← package name
```

Database verification confirms this chain returns correct results — e.g., document 7592 ("Student Handbook") maps to stages "Financial Viability & ASQAnet RTO" and "RTO Documentation - 2025" across packages KS-RTO, KS-CRI, PP, DOC-R, M-DR, etc.

## Fix

**File: `src/components/governance/GovernancePackageAssignments.tsx`**

Rewrite the `queryFn` to:

1. Query `document_instances` for the given `document_id` → get `stageinstance_id` list
2. Query `stage_instances` for those IDs → get `stage_id` + `packageinstance_id`
3. Query `stages` and `packages` (via `package_instances`) for display names
4. Deduplicate by unique (stage_id, package_id) combinations
5. Group by stage, show packages as badges — same UI layout

No database changes needed. Single file change.

