import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useUserAccess } from "@/hooks/useUserAccess";
import { Loader2 } from "lucide-react";
import { AcademyOnlyFallback } from "@/components/client/AcademyOnlyFallback";

// Routes that academy-only users may visit (everything else => fallback)
const ACADEMY_ONLY_ALLOWED_PREFIXES = ["/client/academy", "/academy", "/client/help"];

// Routes that require canManagePortalUsers (primary OR secondary contact)
const USER_MANAGEMENT_PREFIXES = ["/client/users"];

/**
 * Route guard for all /client/* routes.
 * Blocks rendering until tenant + tenant_user context is resolved.
 */
export function ClientRouteGuard({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const {
    activeTenantId,
    tenantUserLoading,
    canAccessClientPortal,
    canManagePortalUsers,
    isAcademyOnly,
    isPreview,
  } = useClientTenant();
  const { isVivacityStaff } = useUserAccess();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (!authLoading && session && activeTenantId === null) {
      const timeout = setTimeout(() => {
        if (activeTenantId === null) {
          console.warn("[ClientRouteGuard] No tenant resolved — redirecting to dashboard");
          navigate("/", { replace: true });
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [authLoading, session, activeTenantId, navigate]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const dashboardMarker = document.querySelector('[data-layout="dashboard"]');
      if (dashboardMarker) {
        console.error("[ClientRouteGuard] DashboardLayout marker detected inside /client route — this is a layout leak.");
      }
    }
  }, []);

  if (authLoading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (activeTenantId === null || tenantUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Resolving tenant…</span>
      </div>
    );
  }

  // Staff impersonation bypasses tenant_user gating — staff already have access.
  if (!isPreview && isVivacityStaff) {
    navigate("/manage-tenants", { replace: true });
    return null;
  }

  if (!isPreview) {
    const path = location.pathname;
    const isAcademyAllowed = ACADEMY_ONLY_ALLOWED_PREFIXES.some((p) => path.startsWith(p));

    if (isAcademyOnly && !isAcademyAllowed) {
      return <AcademyOnlyFallback />;
    }

    const requiresUserMgmt = USER_MANAGEMENT_PREFIXES.some((p) => path.startsWith(p));
    if (requiresUserMgmt && !canManagePortalUsers) {
      console.warn("[ClientRouteGuard] Blocked /client/users — requires canManagePortalUsers");
      navigate("/client/home", { replace: true });
      return null;
    }

    if (!canAccessClientPortal && !isAcademyAllowed) {
      console.warn("[ClientRouteGuard] Blocked — no portal access");
      return <AcademyOnlyFallback />;
    }
  }

  return <>{children}</>;
}
