import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';
import { useRBAC } from './useRBAC';

interface AskVivFeatureFlags {
  floatingLauncherEnabled: boolean;
  explainSourcesEnabled: boolean;
}

const DEFAULT_FLAGS: AskVivFeatureFlags = {
  floatingLauncherEnabled: false,
  explainSourcesEnabled: false,
};

/**
 * Hook to fetch Ask Viv feature flags from app_settings
 * Also handles role-based flag overrides
 */
export function useAskVivFeatureFlags() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();

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
        // Explain sources is always available for SuperAdmin, not stored in DB
        explainSourcesEnabled: true,
      };
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  // Apply role-based overrides
  const computedFlags: AskVivFeatureFlags = {
    floatingLauncherEnabled: flags?.floatingLauncherEnabled ?? false,
    // SuperAdmins always get explain sources, Team Leaders get it if enabled
    explainSourcesEnabled: isSuperAdmin || (isVivacityTeam && (flags?.explainSourcesEnabled ?? false)),
  };

  return {
    flags: computedFlags,
    isLoading,
    error,
  };
}
