import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_STALE_TIMES } from "@/lib/queryConfig";

/**
 * Hook to check if the legacy branding rollback flag is enabled.
 * Reads `legacy_branding_enabled` from the single-row, publicly-readable
 * `public_branding_config` table (separate from `app_settings`, which is
 * staff/admin-only, because this needs to be readable by every signed-in
 * user including client-portal roles).
 *
 * When true, reverts the 2026-07-28 Purple primary color + Anton/Binate/
 * Calibri brand fonts back to the previous Aqua color + default fonts.
 * Toggle via Supabase SQL — no redeploy needed.
 */
export function useLegacyBrandingFlag() {
  const { data, isLoading } = useQuery({
    queryKey: ["legacy-branding-enabled"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any)
        .from("public_branding_config")
        .select("legacy_branding_enabled")
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching legacy_branding_enabled flag:", error);
        return false;
      }

      return (data?.legacy_branding_enabled as boolean) ?? false;
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  return {
    enabled: data ?? false,
    isLoading,
  };
}
