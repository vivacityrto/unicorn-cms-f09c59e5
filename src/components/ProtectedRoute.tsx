import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC, ADMIN_ROUTES, CLIENT_ROUTES, EOS_ROUTES } from '@/hooks/useRBAC';
import { useUserAccess } from '@/hooks/useUserAccess';
import { ACADEMY_ONLY_ROUTES } from '@/config/navigationConfig';
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
  /** Non-SuperAdmin unicorn_role values allowed through; SuperAdmin is always allowed. */
  allowedRoles?: string[];
  /** Permit any Vivacity internal staff member on an otherwise admin-only route. */
  allowVivacityTeam?: boolean;
}

export const ProtectedRoute = ({ children, requireSuperAdmin = false, allowedRoles, allowVivacityTeam = false }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const { canAccessRoute, isSuperAdmin, canAccessEOS, isVivacityTeam } = useRBAC();
  const { hasAcademyOnly, hasFullAccess, isVivacityStaff, isLoading: accessLoading } = useUserAccess();
  const location = useLocation();
  const navigate = useNavigate();

  // Track if we've shown the EOS redirect toast to avoid duplicates
  const hasShownEosToast = useRef(false);

  // Disabled-account check (fetched separately because useAuth's profile
  // select does not include the `disabled` column).
  const [disabledState, setDisabledState] = useState<{ loaded: boolean; disabled: boolean }>({
    loaded: false,
    disabled: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setDisabledState({ loaded: false, disabled: false });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('disabled')
        .eq('user_uuid', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Error checking disabled flag:', error);
        setDisabledState({ loaded: true, disabled: false });
        return;
      }
      setDisabledState({ loaded: true, disabled: data?.disabled === true });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

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

  // Wait for the disabled check before rendering anything else so we never
  // flash the disabled screen or the app shell during the check.
  if (!disabledState.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary-dark to-secondary">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (disabledState.disabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Account Disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Your account has been disabled. You are no longer part of the
              Vivacity internal team. Please contact your administrator.
            </p>
            <Button onClick={handleSignOut} className="w-full">
              Sign Out
            </Button>
          </CardContent>
        </Card>
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

  if (allowedRoles && !isSuperAdmin && !allowedRoles.includes(profile?.unicorn_role ?? '')) {
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

  // Admin routes require administration:access (Super Admin only),
  // except /admin/kpi-* which is also accessible to KPI reviewers.
  if (isAdminRoute && !canAccessRoute(currentPath)) {
    const isKpiAdminRoute = currentPath.startsWith('/admin/kpi-');
    const hasKpiReviewerAccess = profile?.kpi_role === 'reviewer';
    if (!(allowVivacityTeam && isVivacityTeam) && !(isKpiAdminRoute && hasKpiReviewerAccess)) {
      return <Navigate to="/dashboard" replace />;
    }
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
