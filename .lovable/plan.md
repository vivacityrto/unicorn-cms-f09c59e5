# Inline role switcher on Client Users page

Add a small inline role selector in the Role column of `src/components/client/ClientUsersPage.tsx` that lets primary/secondary contacts flip a user between **Academy only** and **Full access** without leaving the page.

## Scope

- Eligible rows: `row.row_type === "active"` AND (`row.relationship_role === "academy_user"` OR `row.relationship_role === "user"`).
- Visible only when `canManagePortalUsers` is true.
- Primary contact, secondary contact, and pending invite rows render the existing read-only `<RolePill>` — unchanged.
- Mobile `<RolePill>` inside `UserCell` stays read-only (the switcher lives only in the desktop Role column to avoid duplication).

## UI

New `RoleSwitcher` component rendered in the Role `<TableCell>` for eligible rows:

- shadcn `<Select>` (compact, `h-8 w-[150px]`) with two options:
  - `academy_user` → "Academy only"
  - `user` → "Full access"
- Current value pre-selected from `row.relationship_role`.
- Disabled while the RPC is in flight (per-row pending state tracked by `user_id`).
- Non-eligible rows continue to render `<RolePill>`.

## Mutation

React Query `useMutation` calling:

```ts
supabase.rpc('set_relationship_role', {
  p_tenant_id: activeTenantId,
  p_user_id: row.user_id,
  p_relationship_role: newRole,          // 'academy_user' | 'user'
  p_reason: null,
})
```

- `pendingUserId` state so only the changing row's selector is disabled.
- On success: `queryClient.invalidateQueries({ queryKey: ["client_tenant_users", activeTenantId] })` and `toast.success("Role updated")`.
- On error: `toast.error(error.message)`. Select is controlled by `row.relationship_role`, so it naturally reverts.

## Out of scope

- No DB changes, no capacity recheck, no changes to `TenantUsersTab`, invite flow, primary/secondary rows, or mobile `RolePill`.

## Files changed

- `src/components/client/ClientUsersPage.tsx` — add `RoleSwitcher` + per-row pending state; render `RoleSwitcher` in the desktop Role cell when eligible, else `RolePill`.

## Verification

- Eligible row shows Select; changing it disables only that row, fires RPC, success toast, list refetches.
- Primary/secondary/invited rows: unchanged pill.
- `canManagePortalUsers === false`: no selector.
- Error path: destructive toast, Select reverts.
