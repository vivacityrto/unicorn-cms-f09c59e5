import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

interface AskVivFeatureFlags {
  floatingLauncherEnabled: boolean;
}

const DEFAULT_FLAGS: AskVivFeatureFlags = {
  floatingLauncherEnabled: false,
};

/**
 * Hook to fetch Ask Viv feature flags from app_settings
 */
export function useAskVivFeatureFlags() {
  const { data: flags, isLoading, error } = useQuery({
    queryKey: ['ask-viv-feature-flags'],
    queryFn: async (): Promise<AskVivFeatureFlags> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('ask_viv_floating_launcher_enabled')
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching Ask Viv feature flags:', error);
        return DEFAULT_FLAGS;
      }

      return {
        floatingLauncherEnabled: data?.ask_viv_floating_launcher_enabled ?? false,
      };
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  return {
    flags: flags ?? DEFAULT_FLAGS,
    isLoading,
    error,
  };
}
