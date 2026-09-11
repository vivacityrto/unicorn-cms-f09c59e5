import { supabase } from "@/integrations/supabase/client";

export interface AskVivAssistantFlags {
  ask_viv_assistant_enabled: boolean | null;
  ask_viv_assistant_beta_user_ids: string[] | null;
  ask_viv_assistant_all_staff: boolean | null;
}

/**
 * Reads the rollout-ring flags for the new Ask Viv Assistant surface. The
 * caller owns React Query and the staff/RBAC decision; this adapter preserves
 * the existing flags query and fail-closed-on-error result as a testable seam.
 */
export async function fetchAskVivAssistantFlags(): Promise<AskVivAssistantFlags | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("ask_viv_assistant_enabled, ask_viv_assistant_beta_user_ids, ask_viv_assistant_all_staff")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching Ask Viv Assistant flags:", error);
    return null;
  }
  return data as AskVivAssistantFlags;
}
