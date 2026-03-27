

## Fix Document-Stage Relationship — Restore `documents.stage` as Authority

### Root Cause
The `stage_documents` junction table has a FK constraint referencing the deprecated `documents_stages` table (IDs 1-70), making it impossible to store data for modern stages (IDs 1000+). The 72 rows currently in it are legacy artifacts with no operational value.

### Changes

#### 1. Truncate `stage_documents` table
SQL migration to empty the table. The 72 rows reference deprecated legacy stage IDs and are not used by any current workflow.

```sql
TRUNCATE TABLE stage_documents;
```

#### 2. Update memory note
The existing memory says "stage_documents remains the valid junction table." This needs correcting to reflect that `documents.stage` is the authoritative source and `stage_documents` is empty/deprecated.

#### 3. Rewrite `src/hooks/useStageTemplateContent.tsx`
- **Fetch**: Query `documents WHERE stage = stageId` instead of `stage_documents`
- **Add/link document**: `UPDATE documents SET stage = stageId WHERE id = docId`
- **Bulk add**: Same pattern for multiple docs
- **Unlink/delete**: `UPDATE documents SET stage = null WHERE id = docId`
- **Reorder**: Remove sort_order logic (not available on `documents.stage`; use title ordering)
- **Copy to package overrides**: Fetch docs from `documents WHERE stage = stageId`

#### 4. Update `src/components/stage/StageDocumentsPanel.tsx`
- **Link from Library dialog**: Change insert from `stage_documents` → `documents.update({ stage: stageId })`
- **Data shape**: Adapt to flat document record (no junction wrapper)

#### 5. Database functions & views (SQL migration)
- **`publish_stage_version`**: Change document snapshot section from `stage_documents sd JOIN documents d` → `documents WHERE stage = p_stage_id`; use defaults for junction-specific fields (is_core, visibility, etc.)
- **`copy_stage_template_to_package`**: Same source change
- **`get_document_stage_usage` function**: Query `documents.stage` joined to `stages` instead of `stage_documents` joined to `documents_stages`
- **`document_stage_usage` view**: Recreate using `documents.stage` → `stages`

#### 6. No changes needed (already correct)
- `useStageQualityCheck.tsx` — already uses `documents.stage`
- `import-unicorn1-client` edge function — already uses `documents.stage`
- `useResolvedStageContent` — already uses `documents.stage`

### Files Modified
| File | Change |
|------|--------|
| SQL migration | Truncate `stage_documents`; update `publish_stage_version`, `copy_stage_template_to_package`, `get_document_stage_usage`, `document_stage_usage` view |
| `src/hooks/useStageTemplateContent.tsx` | Rewrite all document fetch + CRUD to use `documents.stage` |
| `src/components/stage/StageDocumentsPanel.tsx` | Update Link dialog + data shape |
| Memory note | Correct to reflect `documents.stage` as authoritative |

### No structural schema changes
The `stage_documents` table structure stays intact (for potential future migration). Only its data is cleared.

