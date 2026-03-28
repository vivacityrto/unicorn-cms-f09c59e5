

## Audit & Sync: Stage Template Documents vs Client Package Document Instances

### Problem
The admin "Manage Stages" document list (199 documents) shows a different set than the client package document list. This happens because:

- **Admin view** reads directly from `documents WHERE stage = {stageId}` — the live template
- **Client view** reads from `document_instances` — snapshots seeded at publish time
- If documents were added to or removed from a stage template **after** the last publish, the `document_instances` for active packages won't reflect those changes

### Solution: Two-Part Fix

#### Part 1 — Build a Document Sync Audit Tool (Admin UI)

Add a **"Document Sync Status"** panel to the Admin Stage Detail page that compares:
- Template documents (`documents WHERE stage = stageId`) 
- Instance documents (`document_instances` for each active stage_instance)

The panel will show:
- Count of template docs vs instance docs per active package
- **Missing in instances** — docs in template but not yet seeded to a package
- **Orphaned instances** — doc instances whose template doc no longer belongs to this stage
- A **"Sync Now"** button that re-publishes the stage (calls `publish_stage_version`) to push missing documents to all active package instances

This gives SuperAdmins visibility into drift and a one-click fix.

#### Part 2 — Enhance `publish_stage_version` to handle removals (optional, confirm first)

Currently the function is **additive-only** — it inserts missing document_instances but never removes ones whose source document was unlinked from the stage. This is by design (preserving history), but means orphaned instances persist.

We have two options:
1. **Keep additive-only** — orphaned instances stay but the audit panel flags them for manual review
2. **Add soft-delete on publish** — mark document_instances as `status = 'removed'` when their source document no longer has `stage = stageId`

### Implementation Plan

**New file: `src/hooks/useDocumentSyncAudit.ts`**
- Accepts a `stageId`
- Fetches template docs from `documents WHERE stage = stageId`
- Fetches all active `stage_instances` for that stage (via `stage_instances` → `package_instances WHERE is_complete = false`)
- For each stage_instance, fetches `document_instances`
- Compares and returns: `{ missingDocs, orphanedInstances, inSyncCount, totalTemplateCount }` per package

**New component: `src/components/stage/DocumentSyncAuditPanel.tsx`**
- Renders inside the Admin Stage Detail Documents tab
- Shows a summary bar: "X of Y packages in sync"
- Expandable list per package showing missing/orphaned docs
- "Sync All" button that calls `publish_stage_version` to push missing docs

**Modified file: `src/pages/AdminStageDetail.tsx`**
- Import and render `DocumentSyncAuditPanel` within the Documents tab

### Technical Details

- The sync audit uses the same data path as `publish_stage_version`: `documents.stage` is the authoritative source
- No new database tables or migrations needed — this is purely a read-comparison + existing RPC call
- The `publish_stage_version` function already handles additive sync (inserts missing `document_instances` with `NOT EXISTS` guard)
- Re-publishing is safe and idempotent — existing instances are preserved

