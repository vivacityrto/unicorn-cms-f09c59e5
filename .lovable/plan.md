## Fix StageDocumentsPanel + useStageTemplateContent for multi-stage links

Bring the stage's document reads and writes into alignment with the multi-stage model already applied to the other three dialogs. Two problems: reads only consider `documents.stage` (under-reporting shared docs), and writes can silently overwrite a document's existing non-null primary stage.

### 1. `src/hooks/useStageTemplateContent.tsx` — union-aware document fetch (~L144–147)

Replace the single `.eq('stage', stageId)` query in `fetchContent` with a two-step union:

- Query `document_stage_links` for `stage_id = stageId`, collect `additionalIds`.
- Build the `documents` select; if `additionalIds.length > 0`, use `.or(\`stage.eq.${stageId},id.in.(${additionalIds.join(',')})\`)`, otherwise `.eq('stage', stageId)`.
- Order by `title` ascending.

Because step 2 depends on step 1, pull this out of the current `Promise.all([...])`. Run the existing `staff_tasks` / `client_tasks` / `emails` promises in parallel with a `fetchDocsUnionAware()` async helper: `Promise.all([teamPromise, clientPromise, emailsPromise, fetchDocsUnionAware()])`. Destructure results the same way as today.

This also fixes `StageDocumentsPanel.tsx`'s "already-linked" exclusion in `fetchLibraryDocs` for free, since it derives `linkedIds` from the same documents state.

### 2. `useStageTemplateContent.tsx` — `addDocument` (~L389) and `addBulkDocuments` (~L409)

Apply the preserve-primary rule.

For `addBulkDocuments(documentIds)`:

```ts
const { data: currentRows } = await supabase
  .from('documents').select('id, stage').in('id', documentIds);
const toSetPrimary = (currentRows || [])
  .filter(r => r.stage === null || r.stage === stageId).map(r => r.id);
const toLink = (currentRows || [])
  .filter(r => r.stage !== null && r.stage !== stageId).map(r => r.id);

if (toSetPrimary.length > 0) {
  await supabase.from('documents').update({ stage: stageId }).in('id', toSetPrimary);
}
if (toLink.length > 0) {
  await supabase.from('document_stage_links').upsert(
    toLink.map(id => ({ document_id: id, stage_id: stageId })),
    { onConflict: 'document_id,stage_id', ignoreDuplicates: true }
  );
}
```

Apply the single-doc equivalent in `addDocument`. Leave `deleteDocument` (sets `stage: null`) and `updateDocument` (documented no-op) untouched.

### 3. `src/components/stage/StageDocumentsPanel.tsx` — `handleLinkSelected` (~L265–300)

Same pattern: fetch current stage for the selected `docIds`, split into `toSetPrimary` / `toLink`, run the conditional `.update({ stage: stageId })` and the `document_stage_links` upsert with `onConflict: 'document_id,stage_id', ignoreDuplicates: true`. Keep the existing audit-event insert, toast, and success handling unchanged — just fed by the corrected write.

### Out of scope

- `deleteDocument`, `updateDocument`, `handleDuplicateDocument`, `reorderDocuments`.
- `document_stage_usage` view and sync-audit mismatch.
- The four provisioning RPCs and the primary-change trigger.

### Verification

1. Open stage 1114's panel — full document list (173 original + 37 shared) shows, where previously only 173 appeared.
2. In stage 1114's "Link from library," the 37 shared documents no longer appear in the "available" list.
3. Link a document whose primary stage is a different non-null value into an unrelated stage via this panel — `documents.stage` stays untouched; a new `document_stage_links` row appears.
4. Repeat with a document whose current stage is null — primary gets set normally; no link row created.
5. Repeat with a document already on the target stage — no-op, no duplicate link, no error.
