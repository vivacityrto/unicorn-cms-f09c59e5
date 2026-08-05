import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveTenantIdFromPath } from "@/lib/resolveTenantFromRoute";

export interface RouteTenantContext {
  tenantId: number | null;
  tenantName: string | null;
}

/**
 * Resolves the tenant a user is currently looking at, purely from the current
 * route (e.g. `/tenant/:id`) — no localStorage "last viewed" fallback, unlike
 * AskVivPanel's equivalent resolution. This is meant to give Ask Viv Assistant
 * an initial hint of "what client is in view right now", not to persist a
 * scope across pages that don't embed a tenant id at all.
 */
export function useRouteTenantContext(): RouteTenantContext {
  const location = useLocation();
  const [context, setContext] = useState<RouteTenantContext>({ tenantId: null, tenantName: null });

  useEffect(() => {
    const routeTenantId = resolveTenantIdFromPath(location.pathname);
    if (routeTenantId === null) {
      setContext({ tenantId: null, tenantName: null });
      return;
    }

    let cancelled = false;
    supabase
      .from("tenants")
      .select("id, name")
      .eq("id", routeTenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setContext(data ? { tenantId: data.id, tenantName: data.name } : { tenantId: null, tenantName: null });
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  return context;
}
