

## Governance Document Detail Layout Fixes + Drop Legacy Columns

### Part 1: Governance Document Detail Page Layout (GovernanceDocumentDetail.tsx)

Based on the screenshot, three layout issues need fixing:

**A. Category card too narrow** -- The category dropdown is truncated ("z2015..."). Change the grid from equal 4 columns to a weighted layout giving Category more space (e.g., `col-span-2` or a custom grid template).

**B. "Document Status" label too long** -- Rename to just "Status" and make the card narrower.

**C. Description card spans full width unnecessarily** -- Constrain it to a max-width (e.g., `max-w-2xl`).

**D. Format not shown in info cards** -- Add a small "Format" card showing `doc.format` (e.g., "docx") alongside the existing cards.

**Updated layout:**
- Row of cards: Category (wider, ~col-span-2) | Status (narrow) | Format (narrow) | Last Updated | Published Version
- Or use a 5-column grid with Category getting extra width via `md:grid-cols-5` with the Category card spanning 2 columns.

### Part 2: Drop 5 Columns from `documents` Table

| Column | Non-null rows | Active code references | Action |
|--------|--------------|----------------------|--------|
| `due_date` | 0 | None | Safe to drop |
| `document_category` | 0 | GovernanceDocuments.tsx filter, deliver-governance-document, analyze-document edge functions, DocumentLibraryBrowser, AdminDocumentAIReview | Drop column, update code to use `category` instead |
| `package_id` | 39 | TenantDocumentDetail.tsx | Drop column, remove references |
| `stage` | 701 | ManageDocuments.tsx (form field, table column, duplication, save/update) | Drop column, remove Stage form field, table column, and related logic |
| `is_released` | 730 | TenantDocumentDetail.tsx | Drop column, remove references |

### Files to Update

| File | Changes |
|------|---------|
| `src/components/governance/GovernanceDocumentDetail.tsx` | Widen Category card, rename "Document Status" to "Status", add Format card, constrain description width. Remove `document_category` from select query. |
| `src/pages/admin/GovernanceDocuments.tsx` | Remove `document_category` from select and filter. The category filter already uses `category` via `valueLabelMap`. |
| `src/pages/ManageDocuments.tsx` | Remove `stage` from Document interface, form state, form field (Phase combobox), table column, create/update/duplicate logic. Remove stage-related state and fetch. Remove `package_id`, `is_released`, `due_date` from any references. Reduce table `min-w` and `colSpan`. |
| `src/pages/TenantDocumentDetail.tsx` | Remove `package_id`, `stage`, `is_released` from interface and rendering. |
| `src/components/document/DocumentLibraryBrowser.tsx` | Replace `document_category` references with `category`. |
| `src/pages/AdminDocumentAIReview.tsx` | Replace `document_category` references with `category`. |
| `supabase/functions/deliver-governance-document/index.ts` | Change select from `document_category` to `category`. |
| `supabase/functions/analyze-document/index.ts` | Change `document_category` references to `category`. |

### Database Migration

```sql
ALTER TABLE public.documents
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS stage,
  DROP COLUMN IF EXISTS due_date,
  DROP COLUMN IF EXISTS is_released,
  DROP COLUMN IF EXISTS document_category;
```

### Execution Order

1. Update all code references first (remove/replace column usage)
2. Run the database migration to drop columns
3. Deploy updated edge functions

