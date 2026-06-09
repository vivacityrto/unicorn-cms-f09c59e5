## Goal
Create a new `usePermission` hook that queries the `role_permissions` matrix to determine whether the current user has access to a given feature at a specified minimum permission level.

## Context
The project already has:
- `role_permissions` table with `feature_key`, `role`, `level` columns
- `user_roles` junction table with `user_uuid` (not `user_id`) and `role` columns
- `dd_unicorn_roles.value` stores role strings like `'BGT'`, `'CSC'`, `'Team Leader'`
- A `usePermission.ts` file does **not** yet exist

## Plan

### 1. Create `src/hooks/usePermission.ts`
- Use `@tanstack/react-query` to fetch:
  - `role_permissions` (feature_key, role, level)
  - `user_roles` (role) filtered by `user_uuid = user.id`
- Combine the user's `unicorn_role` from `useAuth().profile` with any additional roles from `user_roles`
- Compare permission levels using the ordinal mapping: `full = 3`, `limited = 2`, `owner_only = 1`, `none = 0`
- Return `true` if **any** of the user's roles meets or exceeds the requested `minLevel`

### 2. Verify build passes
- Ensure TypeScript compiles cleanly
- Confirm the hook imports correctly from existing project paths

### 3. Data seed (post-deploy)
- Insert Dave Richards' additional `BGT` role into `user_roles`
  - Target: `email = 'dave@vivacity.com.au'`
  - Granted by: Carl (`email = 'carl@vivacity.com.au'`)
  - On conflict: do nothing

## Acceptance Criteria
- Hook returns `true` for Super Admin on any feature
- Hook returns `true` when a user has any role with sufficient permission
- Hook returns `false` when all roles are below the minimum level or no rows exist
- Hook handles the empty `user_roles` table gracefully (falls back to `unicorn_role` only)