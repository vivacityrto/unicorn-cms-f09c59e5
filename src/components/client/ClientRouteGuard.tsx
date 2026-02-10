import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { Loader2 } from "lucide-react";

/**
 * Route guard for all /client/* routes.
 * Blocks rendering until tenant context is resolved.
 * Redirects if tenant is missing.
 */
export function ClientRouteGuard({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { activeTenantId } = useClientTenant();
  const navigate = useNavigate();

  useEffect(() => {
    // After auth finishes loading, if no session redirect to login
    if (!authLoading && !session) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, session, navigate]);

  useEffect(() => {
    // After auth is done, if session exists but no tenant, redirect safely
    if (!authLoading && session && activeTenantId === null) {
      // Small delay to allow context hydration
      const timeout = setTimeout(() => {
        // Re-check after hydration window
        if (activeTenantId === null) {
          console.warn("[ClientRouteGuard] No tenant resolved — redirecting to dashboard");
          navigate("/", { replace: true });
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [authLoading, session, activeTenantId, navigate]);

  // Dev-mode assertion: warn if DashboardLayout sidebar marker exists
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

  if (activeTenantId === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Resolving tenant…</span>
      </div>
    );
  }

  return <>{children}</>;
}
