## Problem

The `set_relationship_role` PostgreSQL function declares a local variable as:

```
v_u_unicorn_role public.unicorn_role;
```

The `public.unicorn_role` enum type was dropped during the 18 May 2026 enum-to-lookup migration. It now exists only in the `archive` schema (`archive.unicorn_role`, type `e`). Because the function body references a non-existent type in `public`, PostgreSQL cannot parse the function at call time, and every `set_relationship_role` RPC fails.

## Verified Findings

1. **Only occurrence**: `set_relationship_role` is the sole remaining function referencing `public.unicorn_role`. No columns, views, or other functions use it.

2. **Column type**: `users.unicorn_role` is now `text` with a foreign key to `dd_unicorn_roles(value)` ON UPDATE CASCADE ON DELETE RESTRICT. The generated Supabase types also treat it as `string`.

3. **Values are safe**: The function assigns only `'Admin'`, `'User'`, and `'Academy User'` to `v_u_unicorn_role`. All three values exist and are `is_active = true` in `dd_unicorn_roles`.

4. **No signature change needed**: The function's formal arguments (`p_tenant_id bigint`, `p_user_id uuid`, `p_relationship_role text`, `p_reason text`) and return type (`jsonb`) are already correct.

5. **Frontend is unaffected**: `TenantUsersTab.tsx` calls `supabase.rpc('set_relationship_role', {...})` with `string` args. No frontend change is required.

6. **Audit trail preserved**: The function writes to `audit_eos_events` and updates `tenant_users`, `users`, and `tenant_members` atomically. None of that logic changes.

## Change

Replace the function with an identical definition except:

```diff
-   v_u_unicorn_role public.unicorn_role;
+   v_u_unicorn_role text;
```

All other lines remain unchanged, including `SECURITY DEFINER`, `SET search_path`, the full CASE block, and the audit insert.

## Risk Assessment

- **Backward compatibility**: High. The function logic, signature, return shape, and audit output are unchanged. Only the internal variable's declared type is relaxed from a dead enum to `text`.
- **FK integrity**: The `users.unicorn_role` column is `text` with an FK to `dd_unicorn_roles(value)`. Assigning a `text` variable to a `text` column with an FK is exactly what the function already does at runtime. The values being assigned are all valid FK targets.
- **No RLS impact**: This is a body-level type change inside an existing `SECURITY DEFINER` function. No policies or grants are modified.
- **No trigger impact**: No triggers reference `public.unicorn_role`.

## Outcome

After the fix, role changes via `set_relationship_role` will execute successfully again. The Vivacity team and tenant admins will be able to promote, demote, and change user relationship roles as intended.