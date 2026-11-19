/**
 * Rollout flag and daily token budget for client-facing AI features.
 *
 * These read the same settings and usage table as the client Ask Viv chat (`app_settings.ask_viv_client_assistant_*`,
 * `ask_viv_client_assistant_usage`), so one switch turns client AI on for an organisation and one daily budget covers
 * a person's use of both the chat and the summaries. `app_settings` is staff-readable only, so these take a
 * service-role client; that is configuration, not tenant data.
 *
 * The client Ask Viv function still carries its own copy of these helpers; pointing it at this module is a separate,
 * deliberate change (it is a large function with no tests), not something to fold into this one.
 */
import type { createServiceClient } from "./supabase-client.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Master flag, then all-tenants or the beta list for this specific organisation. Fails closed. */
export async function isClientAiEnabledForTenant(supabase: ServiceClient, tenantId: number): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("ask_viv_client_assistant_enabled, ask_viv_client_assistant_all_tenants, ask_viv_client_assistant_beta_tenant_ids")
      .limit(1)
      .maybeSingle();
    if (!data?.ask_viv_client_assistant_enabled) return false;
    if (data.ask_viv_client_assistant_all_tenants) return true;
    // bigint[] can come back as strings, so compare numerically.
    const beta: (number | string)[] = data.ask_viv_client_assistant_beta_tenant_ids || [];
    return beta.some((id) => Number(id) === tenantId);
  } catch (err) {
    console.error("Failed to check the client AI rollout flag:", err);
    return false;
  }
}

/** Whether this person is still inside today's token budget. */
export async function checkClientTokenBudget(supabase: ServiceClient, userId: string): Promise<{ withinCap: boolean; used: number; cap: number }> {
  const { data: settings } = await supabase.from("app_settings").select("ask_viv_client_assistant_daily_token_cap").limit(1).maybeSingle();
  const cap = settings?.ask_viv_client_assistant_daily_token_cap ?? 50_000;
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("ask_viv_client_assistant_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .maybeSingle();
  const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  return { withinCap: used < cap, used, cap };
}

/** Adds this request's tokens to today's row. */
export async function recordClientTokens(supabase: ServiceClient, userId: string, inputTokens: number, outputTokens: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: existing } = await supabase
      .from("ask_viv_client_assistant_usage")
      .select("input_tokens, output_tokens, request_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("ask_viv_client_assistant_usage")
        .update({
          input_tokens: existing.input_tokens + inputTokens,
          output_tokens: existing.output_tokens + outputTokens,
          request_count: existing.request_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("usage_date", today);
    } else {
      await supabase.from("ask_viv_client_assistant_usage").insert({ user_id: userId, usage_date: today, input_tokens: inputTokens, output_tokens: outputTokens, request_count: 1 });
    }
  } catch (err) {
    console.error("Failed to record client AI token usage:", err);
  }
}
