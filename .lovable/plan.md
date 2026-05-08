Invert RBAC default from fail-open to fail-closed.

**src/hooks/useRBAC.tsx**
- Replace `ADMIN_ROUTES` with: `/manage-users`, `/manage-invites`, `/audits`, `/admin/`.
- Delete `ADVANCED_ROUTES` export.
- Add new `CLIENT_ROUTES` export: `/dashboard`, `/settings`, `/profile`, `/client/`, `/client-portal/`.
- Update `canAccessRoute` to drop the `ADVANCED_ROUTES` branch (keep ADMIN + EOS).

**src/components/ProtectedRoute.tsx**
- Change import: `ADVANCED_ROUTES` → `CLIENT_ROUTES`.
- Replace the RBAC checks block: compute `isAdminRoute`, `isEosRoute`, `isClientRoute`; deny-by-default redirect to `/dashboard` when `!isClientRoute && !isVivacityTeam`; then admin check; then existing EOS toast logic untouched.

Loading states, auth check, requireSuperAdmin check, and EOS toast logic remain unchanged.