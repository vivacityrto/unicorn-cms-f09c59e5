import { supabase } from "@/integrations/supabase/client";

export interface AskVivAssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/**
 * Loads one Ask Viv Assistant conversation's turns. The caller owns state
 * updates; this adapter preserves the existing select/filter/order contract
 * and the role normalization used by the chat hook.
 */
export async function fetchAskVivAssistantMessages(conversationId: string): Promise<AskVivAssistantMessage[]> {
  const { data, error } = await supabase
    .from("ask_viv_turns")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data || []).map((turn) => ({
    id: turn.id,
    role: turn.role === "assistant" ? "assistant" : "user",
    content: turn.content,
    created_at: turn.created_at,
  }));
}
