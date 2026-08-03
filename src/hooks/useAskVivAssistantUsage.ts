import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AskVivAssistantUsage {
  usedTokens: number;
  capTokens: number;
  percentUsed: number; // 0-100, capped for display even if somehow over
  unlimited: boolean;
}

export const ASK_VIV_ASSISTANT_USAGE_QUERY_KEY = "ask-viv-assistant-usage";

/**
 * Today's Ask Viv Assistant token usage for the current user, plus the
 * configured daily cap and whether this user is exempt from it
 * (app_settings.ask_viv_assistant_unlimited_user_ids — mirrors the backend
 * check in checkUsageCap() in the edge function). Shared by both UI
 * surfaces (widget + full page) so the gauge reads identically everywhere.
 */
export function useAskVivAssistantUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [ASK_VIV_ASSISTANT_USAGE_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AskVivAssistantUsage> => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: settings }, { data: usage }] = await Promise.all([
        supabase
          .from("app_settings")
          .select("ask_viv_assistant_daily_token_cap, ask_viv_assistant_unlimited_user_ids")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("ask_viv_assistant_usage")
          .select("input_tokens, output_tokens")
          .eq("user_id", user!.id)
          .eq("usage_date", today)
          .maybeSingle(),
      ]);

      const capTokens = settings?.ask_viv_assistant_daily_token_cap ?? 500_000;
      const unlimitedIds: string[] = settings?.ask_viv_assistant_unlimited_user_ids || [];
      const unlimited = unlimitedIds.includes(user!.id);
      const usedTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
      const percentUsed = capTokens > 0 ? Math.min(100, Math.round((usedTokens / capTokens) * 100)) : 0;

      return { usedTokens, capTokens, percentUsed, unlimited };
    },
    staleTime: 15_000,
  });

  const refetchUsage = () => {
    queryClient.invalidateQueries({ queryKey: [ASK_VIV_ASSISTANT_USAGE_QUERY_KEY, user?.id] });
  };

  return { usage: data, isLoading, refetchUsage };
}
