import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_STALE_TIMES } from "@/lib/queryConfig";

/**
 * Hook to check if the Checkpoint Phases feature flag is enabled.
 * Reads `enable_checkpoint_phases` from the single-row `app_settings` table.
 */
export function useCheckpointPhasesEnabled() {
  const { data, isLoading } = useQuery({
    queryKey: ["checkpoint-phases-enabled"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("enable_checkpoint_phases")
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching checkpoint phases flag:", error);
        return false;
      }

      return (data?.enable_checkpoint_phases as boolean) ?? false;
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  return {
    enabled: data ?? false,
    isLoading,
  };
}
