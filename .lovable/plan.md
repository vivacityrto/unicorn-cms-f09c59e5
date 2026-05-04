## What happened

The failed import left package instances behind without their intended stage instances. Cancelling those records changed them into historical/cancelled package instances, and direct deletion is now blocked by related rows such as `package_instance_state_log` and package parent links.

For tenant `7545` I can see the current state is recoverable:

- `15180` — cancelled KS-RTO, no stages, blocked by `package_instance_state_log`
- `15181` — cancelled M-SAR, no stages, blocked by `package_instance_state_log`
- `15190` — cancelled M-SAR, no stages, blocked by `package_instance_state_log`
- `15189` — active KS-RTO, has stages/tasks/documents/emails, but is referenced by child add-on package `15191`
- `15191` — active M-SAR, has stages/tasks/documents/emails, parented to `15189`

## Recommended rectification

### 1. Do not keep cancelling failed import rows

Cancellation is the wrong recovery action for import failures. It is an operational lifecycle action, not a cleanup action. It creates history/log rows that then become FK blockers.

For failed imports, we should use a dedicated cleanup/reimport path that deletes failed instance data in FK-safe order.

### 2. Fix the Unicorn 1 import function so reimport can run cleanly

Update `supabase/functions/import-unicorn1-client/index.ts` only.

The existing cleanup helper deletes stage children and then tries to delete package instances, but it misses current FK blockers. I will extend `clearTenantInstanceData()` so it deletes in this order:

1. Find all tenant package instance IDs.
2. Find all related stage instance IDs.
3. Delete stage child rows:
   - `staff_task_instances`
   - `client_task_instances`
   - `email_instances`
   - `document_instances`
4. Null out or remove references that point at stages/packages before deletion:
   - `client_audits.linked_stage_instance_id` should be set to null for linked stages.
   - child package `parent_instance_id` should be set to null before deleting the parent package instance.
5. Delete package-level child rows:
   - `time_entries`
   - `phase_instances`
   - `package_instance_state_log`
   - `compliance_score_snapshots`
   - `package_notes` if present for those instances
   - `ops_work_items.package_instance_id` should be set to null rather than deleting work items.
6. Delete `stage_instances`.
7. Delete `package_instances`.

This should remove the FK errors when clearing bad imports.

### 3. Fix the package/stage ID mapping issue that caused stages to be missed

The import function currently retries `package_instances` without an explicit ID if the original Unicorn 1 package instance ID collides. However, the stage import still uses the original Unicorn 1 package instance ID as `stage_instances.packageinstance_id`.

That means if a package instance had to be inserted with a new Unicorn 2 ID, its stages either fail FK validation or attach to the wrong/nonexistent instance.

I will add an import-time mapping:

```text
Unicorn 1 PackageInstance.Id -> actual Unicorn 2 package_instances.id
```

Then stage import will insert:

```text
stage_instances.packageinstance_id = mapped actual Unicorn 2 package instance ID
```

instead of blindly using the Unicorn 1 ID.

### 4. Make stage import tolerant of out-of-sync stage IDs

Because you noted the instance tables between Unicorn 1 and Unicorn 2 are out of sync, I will avoid relying solely on Unicorn 1 `Stage_Id` existing in Unicorn 2.

Plan:

- Keep direct `Stage_Id` matching when it is valid.
- If a U1 stage ID does not exist in U2, skip that U1 row instead of breaking the whole package.
- Then ensure every imported package has the current Unicorn 2 package template stages from `package_stages` seeded if missing.

This means the package will still get valid Unicorn 2 stage instances even when U1 historical stage IDs cannot be mapped one-to-one.

### 5. Reseed child instances from Unicorn 2 templates

After stage instances exist, the existing child seeding process will run for:

- staff tasks
- client tasks
- emails
- documents

I will preserve the existing template-based seeding behavior.

### 6. Improve import result reporting

Update the returned result counts so the UI can show useful recovery information, including:

- cleanup counts for previously failed/cancelled package instances
- package instances created/skipped
- stage instances created from U1 rows
- template stages backfilled because U1 stage IDs were unmappable or absent
- child instance seed counts

No UI change is required unless you want the dialog to display the extra cleanup counts more prominently.

## Immediate recovery for the failed client

After the import function is fixed, rerun the Unicorn 1 import for client/tenant `7545` with packages, stages, documents, staff tasks, client tasks, and emails selected.

The fixed cleanup step will remove the cancelled/errant rows safely before reimporting, instead of requiring manual delete attempts.

## Files to change

Only:

- `supabase/functions/import-unicorn1-client/index.ts`

Optional but recommended if you want the manual Package Data Manager delete button fixed too:

- `src/components/client/PackageDataManager.tsx`

I would update this component only if you approve widening the scope. The import-function cleanup is enough to rectify this failed import and future reimports.