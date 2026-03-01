

## Problem

The `documents.category` column currently stores **labels** from `dd_document_categories` (e.g., `"Q1-Training & Assessment"`) instead of the standardised **values** (e.g., `"q1-training_assessment"`). Some records also contain stale numeric IDs (`"20"`, `"1017"`) or comma-separated values (`"20,15,16"`). This needs to be corrected across both the database data and all code that reads/writes/displays categories.

## What Changes

### 1. Data Migration -- Fix existing `documents.category` values

A SQL update will map every current label to its correct `dd_document_categories.value`. The mapping covers all 25 distinct values currently in the table:

- Labels like `"Q1-Training & Assessment"` become `"q1-training_assessment"`
- Mixed-case duplicates like `"CRICOS-Documents"` and `"cricos-documents"` both become `"cricos-documents"`
- Orphan numeric values (`"20"`, `"1017"`, `"20,15,16"`) and the anomaly `"Q2-Learner Support,8"` will be set to `"uncategorised"`

### 2. Frontend -- Select/filter by `value`, display `label`

All UI components that show or filter by document category need to:
- **Store/filter** using the `value` field
- **Display** the human-readable `label` to users

This requires fetching both `label` and `value` from `dd_document_categories` and building a lookup map.

**Files affected:**

| File | Change |
|------|--------|
| `src/pages/admin/GovernanceDocuments.tsx` | Fetch `label, value` from categories. Use `value` for filter matching and saving. Display `label` in the table and filter dropdown. |
| `src/components/governance/GovernanceDocumentDetail.tsx` | Fetch `label, value`. Save `value` on category change. Display `label` in the dropdown and header subtitle. |
| `src/pages/TenantDocuments.tsx` | Build a value-to-label map from `dd_document_categories`. Display `label` in badges instead of raw `value`. |
| `src/components/documents/tabs/GeneratedDocumentsTab.tsx` | Same pattern -- display `label` from lookup. |
| `src/components/client/ClientDocumentsTab.tsx` | Filter by `value`, display `label` in badges and filter dropdown. |
| `src/components/client/ClientGovernanceRegister.tsx` | The `category_subfolder` field comes from deliveries; display using a label lookup. |
| `src/components/AddExistingDocumentDialog.tsx` | Filter uses `doc.category` (now a `value`); display `label` in UI. |

### 3. Edge Functions -- Look up by `value` instead of `label`

| Function | Change |
|----------|--------|
| `supabase/functions/deliver-governance-document/index.ts` | Line ~431: change `.eq("label", doc.document_category)` to `.eq("value", doc.category)` to find the SharePoint folder name. |
| `supabase/functions/verify-compliance-folder/index.ts` | No change needed -- it already selects `label, sharepoint_folder_name` for folder creation and doesn't match against document data. |

### 4. Shared Category Lookup Hook (new file)

Create a small reusable hook `src/hooks/useDocumentCategories.ts` that:
- Fetches `dd_document_categories` (label, value, is_active, sort_order)
- Returns the list plus a `valueLabelMap` for easy display lookups
- Shared across all the UI files above to avoid duplicating queries

## Technical Details

**Data migration SQL (summary):**
```sql
UPDATE documents SET category = cat.value
FROM dd_document_categories cat
WHERE documents.category IS NOT NULL
  AND LOWER(documents.category) = LOWER(cat.label);

-- Orphans to 'uncategorised'
UPDATE documents SET category = 'uncategorised'
WHERE category IS NOT NULL
  AND category NOT IN (SELECT value FROM dd_document_categories);
```

**Hook pattern:**
```typescript
export function useDocumentCategories() {
  const query = useQuery({
    queryKey: ['dd-document-categories'],
    queryFn: async () => { /* fetch label, value */ },
  });
  const valueLabelMap = useMemo(() => new Map(
    query.data?.map(c => [c.value, c.label])
  ), [query.data]);
  return { categories: query.data, valueLabelMap };
}
```

**Display pattern in all UI files:**
```typescript
const { valueLabelMap } = useDocumentCategories();
// In JSX:
{valueLabelMap.get(doc.category) || doc.category || '—'}
```

