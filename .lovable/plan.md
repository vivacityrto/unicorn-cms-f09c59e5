
## Simplify TenantMembers.tsx — Junction Table Only

### What the current code does (wrong)
The `fetchData` function makes three separate queries:
1. `tenant_users` to get `user_id`s
2. `users` filtered by `users.tenant_id` (legacy — to be removed)
3. `users` filtered by `user_uuid IN (...)` (junction users)

Then it merges and deduplicates the two sets. This is unnecessarily complex and the `users.tenant_id` path is being dropped per your instruction.

### What the new code will do (correct)
A single query to `tenant_users` using Supabase's relational join syntax to pull user data in one call:

```
tenant_users
  .select("user_id, role, users(*)")
  .eq("tenant_id", <tenantId>)
```

This joins `tenant_users.user_id = users.user_uuid` via the foreign key, returning the user profile alongside the junction-table role — no merging or deduplication needed.

### Technical Details

**File to edit:** `src/pages/TenantMembers.tsx`

**Changes to `fetchData`:**
- Remove the `directUsers` query (the `users.tenant_id` lookup)
- Remove the `junctionUsers` two-step fetch
- Remove the deduplication logic
- Replace with a single query:
  ```typescript
  const { data, error } = await supabase
    .from("tenant_users")
    .select("user_id, role, users(*)")
    .eq("tenant_id", parseInt(tenantId!));
  ```
- Map the result directly: each row has a `users` sub-object (the joined user record) and `role` from the junction table
- Use `tu.users.unicorn_role || tu.role || "User"` for the member role display, preferring the user's own role field, falling back to the junction table role

### What stays the same
- All UI rendering (table, badges, search, avatar) is unchanged
- Tenant name fetch is unchanged
- Error handling and loading state are unchanged
