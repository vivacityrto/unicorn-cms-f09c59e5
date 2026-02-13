/**
 * useWinBanner – Unicorn 2.0
 * Manages weekly win banner trigger/dismiss state.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWeeklyWins } from './useWeeklyWins';
import { useMemo } from 'react';

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

export interface WinBannerState {
  id: string;
  user_uuid: string;
  week_start_date: string;
  milestone_3_triggered: boolean;
  hours_100_triggered: boolean;
  rocks_5_triggered: boolean;
  dismissed_at: string | null;
}

export function useWinBanner(userUuid: string | null) {
  const queryClient = useQueryClient();
  const weekStart = getWeekStart();
  const { data: wins } = useWeeklyWins(userUuid);

  const { data: bannerState } = useQuery({
    queryKey: ['win-banner-state', userUuid, weekStart],
    queryFn: async () => {
      if (!userUuid) return null;

      const { data, error } = await supabase
        .from('user_win_banner_state' as any)
        .select('*')
        .eq('user_uuid', userUuid)
        .eq('week_start_date', weekStart)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as WinBannerState | null;
    },
    enabled: !!userUuid,
    staleTime: 30_000,
  });

  const activeCondition = useMemo(() => {
    if (!wins || bannerState?.dismissed_at) return null;

    // Check milestone_3
    if (wins.milestones_count >= 3 && !bannerState?.milestone_3_triggered) {
      return { type: 'milestone_3' as const, title: 'Weekly Win', subtitle: '3 milestones this week!' };
    }
    // Check hours_100
    if (wins.hours_logged >= 100 && !bannerState?.hours_100_triggered) {
      return { type: 'hours_100' as const, title: 'Weekly Win', subtitle: '100 hours logged this week!' };
    }
    // Check rocks_5
    if (wins.rocks_closed >= 5 && !bannerState?.rocks_5_triggered) {
      return { type: 'rocks_5' as const, title: 'Weekly Win', subtitle: '5 Rocks completed this week!' };
    }

    return null;
  }, [wins, bannerState]);

  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!userUuid) throw new Error('No user');

      if (bannerState) {
        const { error } = await supabase
          .from('user_win_banner_state' as any)
          .update({ dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', bannerState.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_win_banner_state' as any)
          .insert({
            user_uuid: userUuid,
            week_start_date: weekStart,
            milestone_3_triggered: activeCondition?.type === 'milestone_3',
            hours_100_triggered: activeCondition?.type === 'hours_100',
            rocks_5_triggered: activeCondition?.type === 'rocks_5',
            dismissed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['win-banner-state'] });
    },
  });

  const markTriggered = useMutation({
    mutationFn: async (type: 'milestone_3' | 'hours_100' | 'rocks_5') => {
      if (!userUuid) throw new Error('No user');

      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      updateData[`${type}_triggered`] = true;

      if (bannerState) {
        const { error } = await supabase
          .from('user_win_banner_state' as any)
          .update(updateData)
          .eq('id', bannerState.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_win_banner_state' as any)
          .insert({
            user_uuid: userUuid,
            week_start_date: weekStart,
            [`${type}_triggered`]: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['win-banner-state'] });
    },
  });

  return {
    activeCondition,
    dismiss: () => dismissMutation.mutate(),
    markTriggered: (type: 'milestone_3' | 'hours_100' | 'rocks_5') => markTriggered.mutate(type),
  };
}
