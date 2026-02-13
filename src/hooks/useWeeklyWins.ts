/**
 * useWeeklyWins – Unicorn 2.0
 * Fetches weekly win stats from v_dashboard_weekly_wins.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WeeklyWins {
  user_uuid: string;
  week_start_date: string;
  rocks_closed: number;
  phases_completed: number;
  documents_generated: number;
  clients_moved_forward: number;
  hours_logged: number;
  milestones_count: number;
}

export function useWeeklyWins(userUuid: string | null) {
  return useQuery({
    queryKey: ['weekly-wins', userUuid],
    queryFn: async () => {
      if (!userUuid) return null;

      const { data, error } = await supabase
        .from('v_dashboard_weekly_wins' as any)
        .select('*')
        .eq('user_uuid', userUuid)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as WeeklyWins | null;
    },
    enabled: !!userUuid,
    staleTime: 60_000,
  });
}
