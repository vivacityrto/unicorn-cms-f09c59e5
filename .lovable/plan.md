## Protect `documents.stage` in three write paths

Apply the same rule everywhere: never overwrite a document's existing non-null `stage` with a different value. Instead, leave the primary stage as-is and record the target stage as an additional association in `document_stage_links`.

### Shared rule

Given a document with current stage `curr` and a target stage `target`:

- `curr` is null → set `stage = target` (current behaviour).
- `curr === target` → no-op on stage (current behaviour).
- `curr !== target` (both non-null) → omit `stage` from the UPDATE, then `INSERT INTO document_stage_links (document_id, stage_id) VALUES (docId, target) ON CONFLICT (document_id, stage_id) DO NOTHING`.

### 1. `src/components/AddExistingDocumentDialog.tsx`

- **Dedupe (~L161–167)**: in addition to excluding docs already matching `package_id = packageId AND stage = stageId`, also query `document_stage_links` for rows with `stage_id = stageId` and exclude any `document_id` present there from `newDocuments`.
- **Write (~L187–195)**: for each doc, branch on `selectedDoc.stage`:
  - null or `=== stageId`: existing update `{ package_id, stage: stageId, is_released: true }`.
  - different non-null: update `{ package_id, is_released: true }` (omit `stage`) + insert link `(selectedDoc.id, stageId)` with `ON CONFLICT DO NOTHING`.

### 2. `src/components/CreateDocumentDialog2.tsx`

- **`editDocument` branch only (~L154–178)**: compare `editDocument.stage` to `stageId`.
  - null or equal: unchanged.
  - different non-null: strip `stage` from the update payload; keep the rest of `documentData`; after the update succeeds, insert `(editDocument.id, stageId)` into `document_stage_links` with `ON CONFLICT DO NOTHING`.
- Create/insert branch: unchanged.

### 3. `src/pages/AdminManagePackages.tsx`

- **`editingDocumentId` branch (~L421–440)**: `existingDoc` is already in scope via `packageDocuments.find(...)`. Compare `existingDoc.stage` to `parseInt(documentFormData.stage)`.
  - null or equal: unchanged.
  - different non-null: omit `stage` from the update payload; after the update, insert `(editingDocumentId, parseInt(documentFormData.stage))` into `document_stage_links` with `ON CONFLICT DO NOTHING`.

### Out of scope

- `package_id` handling in all three files.
- Create/insert branches (no prior stage to protect).
- `StageDocumentsPanel.tsx` / `useStageTemplateContent.tsx` (separate read-side fix).

### Verification (manual, per file)

1. Doc on stage 1114, no links → "add"/"link"/"edit" into a different stage: `documents.stage` unchanged, new `document_stage_links` row for the target stage.
2. Doc with `stage = null` → primary gets set normally, no link row created.
3. Doc already on the target stage → no-op, no duplicate link, no error.
