

## Fix Client Commitments Form: Searchable Client + Team Member Dropdown

### Problem
1. **Client dropdown is not searchable** -- with many tenants, users cannot type to filter. Should use the existing `Combobox` component (already used elsewhere, e.g., `InviteUserDialog`).
2. **"Assigned To" is a free-text Input** -- the `assigned_to` column stores a UUID (`user_uuid`), but the form renders a plain text input. Typing a name like "Angela" causes a database error: `invalid input syntax for type uuid: "Angela"`. This needs to be a dropdown of Vivacity team members.

### Changes

**File: `src/pages/ExecutiveClientCommitments.tsx`**

1. **Import `Combobox`** from `@/components/ui/combobox` (replacing the need for the plain Select for tenants).

2. **Import `useTenantUsers`** (or fetch Vivacity team members directly) to populate the "Assigned To" dropdown. Since this is a SuperAdmin context, fetch users from the Vivacity tenant (ID 6372) to list internal staff as assignees.

3. **Add state for team members** -- fetch Vivacity team users on mount, similar to how `fetchTenants` works.

4. **Replace Client (Tenant) Select with Combobox** (lines 191-197):
   - Convert `tenants` array to `ComboboxOption[]` format (`{ value, label }`)
   - Use the `Combobox` component with search functionality
   - This allows typing to filter the tenant list

5. **Replace "Assigned To" Input with Select dropdown** (lines 231-233):
   - Change from `<Input>` to a `<Select>` populated with fetched team members
   - Include an "Unassigned" option
   - Each option value is the user's `user_uuid`
   - Display format: "First Last"

6. **Update table display** for the "Assigned To" column to resolve UUIDs to names using the fetched team members list.

### Technical Detail
- The `Combobox` component at `src/components/ui/combobox.tsx` already supports search filtering, grouped options, and custom placeholders
- Team members will be fetched from the `users` table filtered by `tenant_id = 6372` (Vivacity tenant)
- No database changes required -- `assigned_to` already expects a UUID
