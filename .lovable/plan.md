

## Plan: Fix Instance Seeding and Data Resolution

### Problem Summary

Three issues need fixing:

1. **Documents**: The `start_client_package` RPC seeds `document_instances` from the `stage_documents` table (only 24 rows, mostly stale). The actual source of truth is `documents.stage` (direct 1:1 relationship to `stages.id`). The `stage_documents` intermediary was never used in the legacy system.

2. **Emails**: The RPC filters emails by `e.package_id = p_package_id`, but all emails have `package_id = NULL`. This means zero `email_instances` are ever created. Emails are linked to stages via `emails.stage_id` only.

3. **Client Tasks**: The `useClientTaskInstances` hook incorrectly looks up task metadata from `package_client_tasks` and `stage_client_tasks` (which may not exist or have no data). The correct join is `client_task_instances.clienttask_id` -> `client_tasks.id`.

---

### Changes

#### 1. Update `start_client_package` RPC (Database Migration)

Replace the document and email seeding logic:

**Documents** -- change from `stage_documents` to `documents` table:
```sql
-- OLD: FROM stage_documents sd WHERE sd.stage_id = v_stage.stage_id
-- NEW: FROM documents d WHERE d.stage = v_stage.stage_id
INSERT INTO document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
  FROM documents d
 WHERE d.stage = v_stage.stage_id::integer;
```

**Emails** -- remove the `package_id` filter since emails use `stage_id` only:
```sql
-- OLD: WHERE e.stage_id = ... AND e.package_id = p_package_id
-- NEW: WHERE e.stage_id = ...
INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
  FROM emails e
 WHERE e.stage_id = v_stage.stage_id::integer;
```

#### 2. Fix `useClientTaskInstances` Hook

Replace the metadata lookup logic. Instead of querying `package_client_tasks` and `stage_client_tasks`, directly query the `client_tasks` table:

```typescript
// Join clienttask_id -> client_tasks.id
const metaResult = await supabase
  .from('client_tasks')
  .select('id, name, description, sort_order, is_mandatory')
  .in('id', clientTaskIds);
```

Map `sort_order` to `order_number` for display ordering.

#### 3. Backfill Existing Package Instances (Data Fix)

For already-started packages (like tenant 6346's CHC), emails were never seeded. A one-time backfill SQL will populate `email_instances` for existing `stage_instances` that currently have zero emails:

```sql
INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
SELECT e.id, si.id, e.subject, e.content, false, ''
FROM stage_instances si
JOIN emails e ON e.stage_id = si.stage_id
LEFT JOIN email_instances ei ON ei.email_id = e.id AND ei.stageinstance_id = si.id
WHERE ei.id IS NULL;
```

Similarly for documents, backfill any missing `document_instances` from the `documents` table (where the RPC previously used `stage_documents`):

```sql
INSERT INTO document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
SELECT d.id, si.id, pi.tenant_id, 'pending', false
FROM stage_instances si
JOIN package_instances pi ON pi.id = si.packageinstance_id
JOIN documents d ON d.stage = si.stage_id
LEFT JOIN document_instances di ON di.document_id = d.id AND di.stageinstance_id = si.id
WHERE di.id IS NULL;
```

---

### Technical Summary

| Item | What Changes | File/Location |
|------|-------------|---------------|
| RPC document seeding | `stage_documents` -> `documents.stage` | DB migration (replace RPC) |
| RPC email seeding | Remove `package_id` filter | DB migration (replace RPC) |
| Client task metadata | Query `client_tasks` instead of `stage_client_tasks` | `src/hooks/useClientTaskInstances.ts` |
| Backfill emails | Seed missing `email_instances` for existing stages | DB data insert |
| Backfill documents | Seed missing `document_instances` for existing stages | DB data insert |

