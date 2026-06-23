import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Whether the current user can view any staff member's KPI dashboard.
 * True for SuperAdmins and rows in `user_roles` where `role = 'kpi_reviewer'`.
 */
export function useKpiAccess() {
  const { user, profile } = useAuth();
  const [isReviewer, setIsReviewer] = useState(false);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = profile?.global_role === "SuperAdmin";

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setIsReviewer(false);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "kpi_reviewer")
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setIsReviewer(!!data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return {
    isSuperAdmin,
    isReviewer,
    canViewAnyStaff: isSuperAdmin || isReviewer,
    loading,
  };
}
