import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';
import { useAuth } from './useAuth';
import { useRBAC } from './useRBAC';

interface AskVivAssistantFlags {
  ask_viv_assistant_enabled: boolean | null;
  ask_viv_assistant_beta_user_ids: string[] | null;
  ask_viv_assistant_all_staff: boolean | null;
}

/**
 * Client-side visibility gate for the new Ask Viv Assistant (separate from
 * the existing floating panel, which is always visible regardless of the
 * compliance-mode LLM-generation flag — that flag only ever changed
 * server-side behaviour, never visibility). This is a brand-new surface, so
 * it needs a real rollout-ring visibility check: master flag, then
 * Super Admin / named beta users / all staff, mirroring the same rollout
 * shape already used server-side in ask-viv-assistant/index.ts.
 */
export function useAskVivAssistantAccess() {
  const { user } = useAuth();
  const { isSuperAdmin, canAccessAskViv } = useRBAC();

  const { data, isLoading } = useQuery({
    queryKey: ['ask-viv-assistant-flags'],
    queryFn: async (): Promise<AskVivAssistantFlags | null> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('ask_viv_assistant_enabled, ask_viv_assistant_beta_user_ids, ask_viv_assistant_all_staff')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching Ask Viv Assistant flags:', error);
        return null;
      }
      return data as AskVivAssistantFlags;
    },
    staleTime: QUERY_STALE_TIMES.REFERENCE,
  });

  const inRolloutRing = Boolean(
    data?.ask_viv_assistant_enabled &&
      (data?.ask_viv_assistant_all_staff ||
        isSuperAdmin ||
        (data?.ask_viv_assistant_beta_user_ids || []).includes(user?.id ?? ''))
  );

  return {
    // Same base Vivacity-staff gate as the existing panel — no new permission needed —
    // plus the new rollout-ring check on top.
    enabled: canAccessAskViv() && inRolloutRing,
    isLoading,
  };
}
