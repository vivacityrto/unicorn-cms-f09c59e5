## Fix package_id assignment in TimeLogDrawer.tsx

**Root cause:** `savePackageInstance` (single-entry) and the bulk reassign `onClick` both send `instance.package_id` (the template/package definition ID) as `package_id`. The database trigger `fn_validate_time_entry_package` expects `package_id` to be the package **instance** ID (same as `package_instance_id`).

**Changes:**

1. **Single-entry `savePackageInstance`** — Remove the `instance` / `newPackageId` lookup and set `package_id: newInstanceId` instead of `package_id: newPackageId ?? undefined`.

2. **Bulk reassign `onClick`** — Remove the `instance` / `newPackageId` lookup and set `package_id: newInstanceId` instead of `package_id: newPackageId`.

No other code changes. Both `package_id` and `package_instance_id` will always carry the same instance ID value, matching how `AddTimeDialog` inserts entries and satisfying the DB validation trigger.