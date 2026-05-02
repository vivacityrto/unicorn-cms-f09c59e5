# Rename "Team" → "Users" in client side nav

## Current state (different from prompt assumptions)

- `src/components/client/ClientSidebar.tsx` already has the Team item flagged `adminOnly: true` (line 60), and the sidebar already filters via `filterAdmin(...)` using `useAuth().getTenantRole(activeTenantId) === "Admin"` plus a SuperAdmin override.
- `getTenantRole` reads from the `memberships` array on the auth context. SuperAdmins always return `"Admin"` (so impersonation is covered).
- `src/App.tsx` already has **both** routes registered:
  - line 1090: `/client/users` → `ClientUsersWrapperNew`
  - line 1091: `/client/team` → `ClientTeamWrapperNew`

So the admin-gating work is already done. The only outstanding work is the rename + redirect.

## Changes

### 1. `src/components/client/ClientSidebar.tsx` — line 60
Change the nav entry label and path:
```tsx
{ icon: Users, label: "Users", path: "/client/users", adminOnly: true },
```
Keep the lucide `Users` icon, keep `adminOnly: true`, keep position in `clientMenuItemsAfter`.

### 2. `src/App.tsx` — line 1091
Replace the `/client/team` route with a redirect to `/client/users`:
```tsx
<Route path="/client/team" element={<Navigate to="/client/users" replace />} />
```
The `/client/users` route on line 1090 already renders `ClientUsersWrapperNew` and stays untouched. `Navigate` is already imported in App.tsx (used elsewhere in the file).

### 3. Sweep for any other `/client/team` references
Verified via ripgrep: only the two lines above reference `/client/team` or the `"Team"` nav label. No other files need updating.

## What is NOT changed (and why)

- **No new `useIsTenantAdmin` hook.** The prompt proposed one, but the sidebar already uses `useAuth().getTenantRole(activeTenantId) === "Admin"` which is the established pattern across the client portal. Adding a parallel hook that queries `tenant_users` directly would duplicate logic, add a redundant network round-trip per render, and diverge from how every other admin-gated surface decides admin status. If the auth-context mapping from `relationship_role` → `"Admin"` is wrong, that's a separate bug to fix in `useAuth` (one place), not to route around with a new hook.
- **No page component changes.** `ClientTeamWrapperNew` becomes unreachable after the redirect; leaving the file in place is fine — Prompt B will replace `ClientUsersWrapperNew`.
- **No SQL, no view changes, no other nav items touched.**

## Files touched

- `src/components/client/ClientSidebar.tsx` (one line)
- `src/App.tsx` (one line)

## Smoke checks after deploy

- Admin on AHMRC: "Users" appears in side nav, routes to `/client/users`.
- Non-admin user: "Users" hidden (already gated, behaviour unchanged).
- Old bookmark `/client/team` → redirects to `/client/users`.
- Icon, position, mobile rendering unchanged.
