/**
 * useEngagementSettings – Unicorn 2.0
 *
 * Fetches tenant_engagement_settings. Falls back to defaults.
 * Used by celebration/engagement features to check config gates.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EngagementSettings {
  celebrations_enabled: boolean;
  sound_enabled: boolean;
  weekly_win_tracker_enabled: boolean;
  leaderboard_enabled: boolean;
  completion_cascade_enabled: boolean;
}

const DEFAULTS: EngagementSettings = {
  celebrations_enabled: true,
  sound_enabled: false,
  weekly_win_tracker_enabled: true,
  leaderboard_enabled: false,
  completion_cascade_enabled: true,
};

export function useEngagementSettings(tenantId: number | null) {
  return useQuery({
    queryKey: ['engagement-settings', tenantId],
    queryFn: async (): Promise<EngagementSettings> => {
      if (!tenantId) return DEFAULTS;

      const { data, error } = await supabase
        .from('tenant_engagement_settings' as any)
        .select('celebrations_enabled, sound_enabled, weekly_win_tracker_enabled, leaderboard_enabled, completion_cascade_enabled')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error || !data) return DEFAULTS;

      const d = data as any;
      return {
        celebrations_enabled: d.celebrations_enabled ?? true,
        sound_enabled: d.sound_enabled ?? false,
        weekly_win_tracker_enabled: d.weekly_win_tracker_enabled ?? true,
        leaderboard_enabled: d.leaderboard_enabled ?? false,
        completion_cascade_enabled: d.completion_cascade_enabled ?? true,
      };
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}
