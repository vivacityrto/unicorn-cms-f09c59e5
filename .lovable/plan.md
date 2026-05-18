## Plan: Widen UserProfile.unicorn_role type to include 'Academy User'

### What
In `src/hooks/useAuth.tsx`, add `'Academy User'` to the `unicorn_role` union type on the `UserProfile` interface.

### Why
The database `users.unicorn_role` column already allows `'Academy User'` (seeded in `dd_unicorn_roles`). The TypeScript interface must reflect all valid DB values so downstream consumers can correctly narrow on this role.

### Exact diff
```diff
-  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User';
+  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member' | 'Admin' | 'User' | 'Academy User';
```

### Validation
1. Run `tsc --noEmit` (or `bun run build`) to confirm no new TypeScript errors from unicorn_role consumers.
2. No other files touched.

### Out of scope (explicitly excluded)
- `src/components/InviteUserDialog.tsx`
- Any other file
- Any database query, hook logic, RLS policy, or SQL function