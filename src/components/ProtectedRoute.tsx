import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC, ADMIN_ROUTES, CLIENT_ROUTES, EOS_ROUTES } from '@/hooks/useRBAC';
import { useUserAccess } from '@/hooks/useUserAccess';
import { ACADEMY_ONLY_ROUTES } from '@/config/navigationConfig';
import { useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

export const ProtectedRoute = ({ children, requireSuperAdmin = false }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const { canAccessRoute, isSuperAdmin, canAccessEOS, isVivacityTeam } = useRBAC();
  const { hasAcademyOnly, hasFullAccess, isVivacityStaff, isLoading: accessLoading } = useUserAccess();
  const location = useLocation();
  
  // Track if we've shown the EOS redirect toast to avoid duplicates
  const hasShownEosToast = useRef(false);

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

  // Wait for profile before role-gating. useAuth flips `loading` to false
  // as soon as the session resolves, but profile is fetched asynchronously
  // (setTimeout in onAuthStateChange / getSession). Without this gate,
  // Vivacity staff get a transient isVivacityTeam=false and are redirected
  // to /dashboard from non-client routes like /manage-documents.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Academy-only users must never land on /dashboard (it hangs querying
  // tenant data they can't access). Redirect them to /academy on any
  // non-academy route. Mirrors PostSignInRedirect's flag logic.
  if (!accessLoading && hasAcademyOnly && !hasFullAccess && !isVivacityStaff) {
    const isAcademyRoute = ACADEMY_ONLY_ROUTES.some(r => location.pathname.startsWith(r));
    if (!isAcademyRoute) {
      return <Navigate to="/academy" replace />;
    }
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }




  const currentPath = location.pathname;
  const isAdminRoute = ADMIN_ROUTES.some(route => currentPath.startsWith(route));
  const isEosRoute = EOS_ROUTES.some(route => currentPath.startsWith(route));
  const isClientRoute = CLIENT_ROUTES.some(route => currentPath.startsWith(route));

  // Deny-by-default: any route not in CLIENT_ROUTES requires Vivacity Team membership.
  // Clients (unicorn_role 'Admin' or 'User') are redirected to dashboard.
  if (!isClientRoute && !isVivacityTeam) {
    return <Navigate to="/dashboard" replace />;
  }

  // Admin routes require administration:access (Super Admin only).
  if (isAdminRoute && !canAccessRoute(currentPath)) {
    return <Navigate to="/dashboard" replace />;
  }

  // EOS routes: Vivacity Team only — keep existing toast logic below this check unchanged.
  if (isEosRoute && !canAccessEOS()) {
    // Show toast only once per session to avoid spam
    if (!hasShownEosToast.current) {
      hasShownEosToast.current = true;
      // Use setTimeout to ensure toast fires after redirect
      setTimeout(() => {
        toast({
          title: 'EOS is available to Vivacity Team only',
          description: 'Contact Vivacity Coaching & Consulting if you need access to EOS features.',
          variant: 'default',
        });
      }, 100);
    }
    // Clients trying to access EOS get redirected to dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // Reset toast flag when navigating to non-EOS routes
  if (!isEosRoute) {
    hasShownEosToast.current = false;
  }

  return <>{children}</>;
};
