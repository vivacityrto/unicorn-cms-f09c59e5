import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { fetchAskVivAssistantUsage, type AskVivAssistantUsage } from "./askVivAssistantUsage";

export type { AskVivAssistantUsage } from "./askVivAssistantUsage";

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
    queryFn: () => fetchAskVivAssistantUsage(user!.id),
    staleTime: 15_000,
  });

  const refetchUsage = () => {
    queryClient.invalidateQueries({ queryKey: [ASK_VIV_ASSISTANT_USAGE_QUERY_KEY, user?.id] });
  };

  return { usage: data, isLoading, refetchUsage };
}
