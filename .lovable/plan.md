

## Fix `start_client_package` RPC to Use Legacy Tables

### Problem Summary

The current `start_client_package` RPC writes to 5 **new empty tables** (`client_packages`, `client_package_stages`, `client_team_tasks`, `client_email_queue`, `client_stage_documents`) that the rest of the app does not read from. The app reads from the legacy tables: `package_instances`, `stage_instances`, `staff_task_instances`, `client_task_instances`, `email_instances`, `document_instances`.

Additionally, `fetchPackageStages` in `useClientPackageInstances.tsx` also queries the new tables. Both the RPC and the hook need rewriting.

The RPC also references non-existent template tables (`package_staff_tasks`, `package_client_tasks`, `package_stage_emails`, `package_stage_documents`) -- these exist but are empty parallel structures. The real legacy templates are: `staff_tasks`, `client_tasks` (templates), `emails`, and `stage_documents`.

### What Changes

**1. Database Migration -- Rewrite the RPC + add sequences**

All 6 legacy instance tables lack auto-increment sequences on their `id` columns. The migration will:

- Add auto-increment sequences to: `package_instances`, `stage_instances`, `staff_task_instances`, `client_task_instances`, `email_instances`, `document_instances` (starting above current max values)
- Drop and recreate `start_client_package` to return `BIGINT` (not UUID) and write exclusively to legacy tables:

```text
Input: p_tenant_id (bigint), p_package_id (bigint), p_assigned_csc_user_id (uuid)
Returns: BIGINT (the new package_instances.id)

Steps:
1. INSERT into package_instances
   - tenant_id, package_id, start_date = CURRENT_DATE
   - manager_id = p_assigned_csc_user_id
   - is_complete = false, is_active = true
   - included_minutes = (packages.total_hours * 60)
   -> RETURNING id

2. FOR EACH row in package_stages WHERE package_id = p_package_id:
   INSERT into stage_instances
   - stage_id (integer, from package_stages.stage_id)
   - packageinstance_id (note: no underscore separation)
   - stage_sortorder, status_id = 0, status = 'Not Started'
   - is_recurring (from package_stages)
   -> RETURNING id as v_stage_instance_id

   2a. Staff tasks: INSERT into staff_task_instances
       FROM staff_tasks WHERE stage_id = v_stage.stage_id
       - stafftask_id, stageinstance_id, status_id = 0, status = 'Not Started'

   2b. Client tasks: INSERT into client_task_instances
       FROM client_tasks WHERE stage_id = v_stage.stage_id
       - clienttask_id, stageinstance_id, status = 0
       - due_date = CURRENT_DATE + due_date_offset (if set)

   2c. Emails: INSERT into email_instances
       FROM emails WHERE stage_id = v_stage.stage_id AND package_id = p_package_id
       - email_id, stageinstance_id, subject, content, is_sent = false

   2d. Documents: INSERT into document_instances
       FROM stage_documents WHERE stage_id = v_stage.stage_id
       - document_id, stageinstance_id, tenant_id, status = 'pending', isgenerated = false

3. Audit log entry to client_audit_log
```

Key column-name details:
- `stage_instances.packageinstance_id` (no underscore -- legacy quirk)
- `staff_tasks.stage_id` is integer; `package_stages.stage_id` is bigint -- cast where needed
- `emails` template is scoped by both `stage_id` AND `package_id`
- `stage_documents` is scoped only by `stage_id`

**2. Update `useClientPackageInstances.tsx` -- `fetchPackageStages`**

Rewrite to query legacy tables instead of the new ones:

- **Stages**: `stage_instances` WHERE `packageinstance_id = :id`, joined with `documents_stages` on `stage_id` for title/description
- **Staff tasks**: `staff_task_instances` WHERE `stageinstance_id` matches, joined with `staff_tasks` for name/description
- **Client tasks**: Already queries `client_task_instances` (correct, keep as-is)
- **Documents**: `document_instances` WHERE `stageinstance_id` matches, joined with `documents` for title
- **Emails**: `email_instances` WHERE `stageinstance_id` matches

**3. Update `useClientPackageInstances.tsx` -- `updateStageStatus`**

Change from writing to `client_package_stages` to writing to `stage_instances` (mapping status strings to `status_id` integers + `status` text).

**4. Update `useClientPackageInstances.tsx` -- `updateTeamTaskStatus`**

Change from writing to `client_team_tasks` to writing to `staff_task_instances` (mapping status strings to `status_id` integers).

**5. Update `StartPackageDialog.tsx`**

The RPC now returns a `BIGINT` instead of a UUID. Update the navigation after starting a package to route to the tenant's package detail view using the bigint ID (e.g., `/tenant/{tenantId}?package={packageInstanceId}`).

**6. Update TypeScript interfaces**

Adjust `ClientPackageStage`, `ClientTeamTask`, `ClientStageDocument`, `ClientEmailQueue` interfaces to match legacy column shapes (bigint IDs as numbers, legacy column names).

### Not Changed (deferred cleanup)

- The 5 new empty tables (`client_packages`, `client_package_stages`, `client_team_tasks`, `client_email_queue`, `client_stage_documents`) will remain but are unused. They can be dropped in a separate cleanup migration.
- The 4 new template tables (`package_staff_tasks`, `package_client_tasks`, `package_stage_emails`, `package_stage_documents`) also remain unused.

