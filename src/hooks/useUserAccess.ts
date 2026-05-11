import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";

export type UserAccessFlags = {
  isVivacityStaff: boolean;
  hasFullAccess: boolean;
  hasAcademyOnly: boolean;
  hasAnyTenant: boolean;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Single source of truth for caller-level access flags used by the
 * post-sign-in router and the AcademyTopBar back-link.
 *
 * Staff short-circuit: Vivacity staff don't need the tenant_users probe,
 * the router checks isVivacityStaff first.
 */
export function useUserAccess(): UserAccessFlags {
  const { user, profile, isSuperAdmin, loading: authLoading } = useAuth();
  const { isVivacityTeam } = useRBAC();
  const userId = user?.id ?? null;

  const isVivacityStaff = isSuperAdmin() || isVivacityTeam;

  const enabled = !!userId && !authLoading && !isVivacityStaff;

  const { data, isLoading, error } = useQuery({
    queryKey: ["user-access", userId],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ access_scope: string | null }[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("tenant_users")
        .select("access_scope")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as { access_scope: string | null }[];
    },
  });

  const rows = data ?? [];
  const hasFullAccess = rows.some((r) => r.access_scope === "full");
  const hasAcademyOnly = rows.some((r) => r.access_scope === "academy_only");
  const hasAnyTenant = rows.length > 0;

  return {
    isVivacityStaff,
    hasFullAccess,
    hasAcademyOnly,
    hasAnyTenant,
    isLoading: authLoading || (!!userId && profile === null) || (enabled && isLoading),
    error: (error as Error | null) ?? null,
  };
}
