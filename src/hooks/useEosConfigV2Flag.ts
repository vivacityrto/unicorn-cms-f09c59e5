import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_STALE_TIMES } from "@/lib/queryConfig";

/**
 * Hook to check if the EOS Configuration v2 overhaul is enabled.
 * Reads `eos_config_v2` from the single-row `app_settings` table.
 * While false, the old "Manage Templates" / per-meeting-agenda flow stays live.
 */
export function useEosConfigV2Flag() {
  const { data, isLoading } = useQuery({
    queryKey: ["eos-config-v2-enabled"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("eos_config_v2")
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching eos_config_v2 flag:", error);
        return false;
      }

      return data?.eos_config_v2 ?? false;
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  return {
    enabled: data ?? false,
    isLoading,
  };
}
