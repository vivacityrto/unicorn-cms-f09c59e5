import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC, ADMIN_ROUTES, ADVANCED_ROUTES, EOS_ROUTES } from '@/hooks/useRBAC';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

export const ProtectedRoute = ({ children, requireSuperAdmin = false }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const { canAccessRoute, isSuperAdmin, canAccessEOS } = useRBAC();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if route requires SuperAdmin access
  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check RBAC route access (admin, advanced, and EOS routes)
  const currentPath = location.pathname;
  const isAdminRoute = ADMIN_ROUTES.some(route => currentPath.startsWith(route));
  const isAdvancedRoute = ADVANCED_ROUTES.some(route => currentPath.startsWith(route));
  const isEosRoute = EOS_ROUTES.some(route => currentPath.startsWith(route));

  if ((isAdminRoute || isAdvancedRoute) && !canAccessRoute(currentPath)) {
    // Redirect users trying to access admin/advanced routes without permission
    return <Navigate to="/dashboard" replace />;
  }

  // Block EOS routes for non-Vivacity users (clients)
  if (isEosRoute && !canAccessEOS()) {
    // Clients trying to access EOS get redirected to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
