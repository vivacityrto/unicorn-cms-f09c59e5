import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissionDetailed } from '@/hooks/usePermission';

interface PermissionGateProps {
  /** role_permissions feature key, e.g. 'academy.mapping.view'. */
  featureKey: string;
  minLevel?: 'full' | 'limited' | 'owner_only';
  /** Where to send a user whose permission check resolves to denied. */
  redirectTo?: string;
  children: ReactNode;
}

/**
 * Route-level guard for a permission that lives in the role_permissions
 * matrix rather than a fixed unicorn_role list (unlike ProtectedRoute's
 * requireSuperAdmin/allowedRoles/allowVivacityTeam props). Composed above
 * DashboardLayoutRoute in a route's guard chain, the same way ProtectedRoute
 * is, so the shell never mounts before the permission result is known --
 * the loading state below renders instead of children until then.
 *
 * Nest this inside a ProtectedRoute tier (e.g. allowedRoles=
 * ACADEMY_BUILDER_ROLES) rather than replacing it: this only adds a
 * stricter, feature-specific check on top of the coarser role tier.
 */
export const PermissionGate = ({
  featureKey,
  minLevel = 'limited',
  redirectTo = '/dashboard',
  children,
}: PermissionGateProps) => {
  const { granted, isLoading } = usePermissionDetailed(featureKey, minLevel);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!granted) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
