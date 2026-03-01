

## Cleanup: Drop Legacy Field Tables

### Tables to Drop

| Table | Rows | Verdict | Reason |
|-------|------|---------|--------|
| `document_fields` | 2,377 | **KEEP** | Active join table linking documents to `dd_fields`. Used by governance delivery, tailoring, import scanner, merge field editor, and multiple UI components. |
| `client_fields` | 9,392 | **DROP** | Legacy. No foreign keys, no active code references. Superseded by `dd_fields` + `v_tenant_merge_fields`. |
| `clientfields` | 8,184 | **DROP** | Legacy duplicate of `client_fields`. Only referenced in an old RLS migration. |
| `documents_fields` | 24 | **DROP** | Legacy field definitions table. Only used by the old `ManageFields.tsx` and `ManageDocuments.tsx` pages. Superseded by `dd_fields`. |
| `merge_field_definitions` | 22 | **DROP** | Legacy table created early in development. Superseded entirely by `dd_fields` + `v_tenant_merge_fields`. No active code references. |

### Code to Remove or Update

**Files to delete:**
- `src/pages/ManageFields.tsx` — legacy page that CRUDs `documents_fields`. Replaced by the Merge Field Tags admin page (`/admin/merge-field-tags`).
- `src/pages/ManageFieldsWrapper.tsx` — wrapper for the above.

**Files to update:**

| File | Change |
|------|--------|
| `src/App.tsx` | Remove the `/manage-fields` route and its lazy import. |
| `src/pages/ManageDocuments.tsx` | Remove the `fetchFields` function that queries `documents_fields`, remove the fields count display, and remove the navigation link to `/manage-fields`. |

### Database Migration

A single migration will:
1. Drop all RLS policies on the four legacy tables.
2. Drop the four tables: `client_fields`, `clientfields`, `documents_fields`, `merge_field_definitions`.

### What is NOT Affected

- The active `document_fields` table (note: no "s" before "fields") remains untouched.
- The `dd_fields` table and `/admin/merge-field-tags` page remain the authoritative source for merge field management.
- The `v_tenant_merge_fields` view continues to work as before.
- No edge functions reference any of the four legacy tables.

