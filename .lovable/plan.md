

## Two Issues

### Issue 1 — "Failed to import time" error
**Root cause** (confirmed via DB logs): `package_id 1027 does not belong to tenant 7532`.

In `AddTimeFromMeetingDialog.tsx` the `packages` array contains `{ id: package_instance_id, package_id: <base id>, package_name }`. The dialog sends `selectedPackageId` (= `package_instance_id`, e.g. **1027**) into `rpc_import_meeting_time_to_client` as `p_package_id`, but the RPC validates/inserts that value as a **base** `package_id` against `package_instances.package_id`. They never match → the RPC fails the tenant ownership check (and even if it passed, the resulting `time_entries` row would be missing `package_instance_id`, which is the platform standard).

**Fix:**
1. **Frontend** (`AddTimeFromMeetingDialog.tsx`) — rename the RPC param semantically and pass the **package_instance_id**:
   - Change the call to send `p_package_instance_id: selectedPackageId` (instance id) instead of `p_package_id`.
   - The default (`defaultPackageId={selectedPackage?.package_id}`) is also wrong — should be `selectedPackage?.id` so the preselected option matches an item in the `packages` list.

2. **Backend** — supersede `rpc_import_meeting_time_to_client` with a new signature accepting `p_package_instance_id bigint`:
   - Resolve `package_instances` row for that id and verify `tenant_id = p_client_id`.
   - Insert into `time_entries` with **both** `package_id` (derived from the instance) and `package_instance_id` (per `time-tracking-schema-standards`).
   - Same change for the draft branch (`calendar_time_drafts` already accepts the base `package_id`, but we'll also store the instance via the `suggestion`/`suggested_package_id` field for parity).
   - Keep the legacy signature as a thin wrapper that errors with a clearer message if called.

3. Migration is required (new RPC + drop/replace).

### Issue 2 — Add a Secondary Contact to a Tenant
Currently `tenant_users.primary_contact boolean` flags the primary; the role selector only offers **Primary Contact** / **User**. We'll add a parallel **Secondary Contact** role.

**Schema (migration)**
- `ALTER TABLE tenant_users ADD COLUMN secondary_contact boolean NOT NULL DEFAULT false;`
- Partial unique index to enforce at most one secondary per tenant:
  `CREATE UNIQUE INDEX tenant_users_one_secondary ON tenant_users(tenant_id) WHERE secondary_contact = true;`
- Add `secondary_contact_name/email/phone` denormalised fields to `tenant_profile` (mirror primary), populated by trigger when a `tenant_users` row is flagged `secondary_contact = true` (mirrors how primary already works).

**Frontend (`TenantUsersTab.tsx`)**
- Add a new role value `secondary` to the role Select (both inline list and Edit Drawer):
  - `parent` → Primary Contact
  - `secondary` → Secondary Contact (new, with a distinct icon e.g. `UserCheck`)
  - `child` → User
- Update `handleRoleChange` to set `primary_contact` / `secondary_contact` flags based on selection (mutually exclusive — picking Secondary clears Primary on that row, and vice-versa).
- Update `getRoleLabel` and the read-only badge styling.
- Update `useClientManagement.tsx` to also surface `secondary_contact_*` fields where primary is shown.

**Display surfaces**
- `TenantDetail.tsx` header: under "Primary Contact: …" line, show "Secondary Contact: …" when present.
- `ClientDetail.tsx`: same secondary contact row.
- Merge fields: register `{{SecondaryContactName}}`, `{{SecondaryContactEmail}}`, `{{SecondaryContactPhone}}` in `resolve_tenant_merge_fields` (parallel to existing primary merge fields).

## Files changed
- New migration: add `tenant_users.secondary_contact`, partial unique index, `tenant_profile.secondary_contact_*` columns, trigger to sync, replacement `rpc_import_meeting_time_to_client(... p_package_instance_id bigint ...)`, update `resolve_tenant_merge_fields`.
- `src/components/client/AddTimeFromMeetingDialog.tsx` — pass instance id; fix `defaultPackageId` source.
- `src/components/client/TenantTimeTrackerBar.tsx` — pass `selectedPackage?.id` as default.
- `src/components/client/TenantUsersTab.tsx` — add Secondary Contact option + role-change logic.
- `src/hooks/useClientManagement.tsx` — surface secondary contact fields.
- `src/pages/TenantDetail.tsx`, `src/pages/ClientDetail.tsx` — render secondary contact.

No changes to RLS or roles enum (Secondary is a tenant-level contact flag, not an app role).

