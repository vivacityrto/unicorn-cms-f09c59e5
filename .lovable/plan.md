

## Replace Created Date with Primary Contact on Manage Clients List

### What Changes

Replace the `created_at` date shown beneath each tenant name with the **primary contact's name** — far more useful since `created_at` just reflects the Unicorn 1 import date.

### How

1. **Fetch primary contacts** in `fetchTenants()` — query `tenant_users` where `primary_contact = true`, then join to `users` to get names.

2. **Add to tenant data** — add `primary_contact_name` to the Tenant interface and the mapped data.

3. **Update the UI** (line 830-834) — replace the Calendar icon + date with a User icon + primary contact name. If no primary contact exists, show "No primary contact".

### Files Modified

- `src/pages/ManageTenants.tsx` only

