import { supabase } from "@/integrations/supabase/client";

export interface AskVivAssistantUsage {
  usedTokens: number;
  capTokens: number;
  percentUsed: number; // 0-100, capped for display even if somehow over
  unlimited: boolean;
}

/**
 * Reads today's Ask Viv Assistant usage and its configured daily cap for one
 * user. The caller owns the React Query lifecycle; this adapter preserves the
 * existing settings/usage reads and display math as a testable boundary.
 */
export async function fetchAskVivAssistantUsage(userId: string): Promise<AskVivAssistantUsage> {
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
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle(),
  ]);

  const capTokens = settings?.ask_viv_assistant_daily_token_cap ?? 500_000;
  const unlimitedIds: string[] = settings?.ask_viv_assistant_unlimited_user_ids || [];
  const unlimited = unlimitedIds.includes(userId);
  const usedTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  const percentUsed = capTokens > 0 ? Math.min(100, Math.round((usedTokens / capTokens) * 100)) : 0;

  return { usedTokens, capTokens, percentUsed, unlimited };
}
