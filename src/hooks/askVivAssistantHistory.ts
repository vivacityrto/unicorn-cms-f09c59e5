import { supabase } from "@/integrations/supabase/client";

export interface AskVivAssistantConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

/**
 * Loads the recent Ask Viv Assistant conversations. The caller owns state
 * updates; this adapter preserves the existing mode filter, ID de-duplication,
 * and conversation ordering/limit contract.
 */
export async function fetchAskVivAssistantHistory(): Promise<AskVivAssistantConversationSummary[]> {
  const { data: turnRows, error: turnErr } = await supabase
    .from("ask_viv_turns")
    .select("conversation_id")
    .eq("mode", "assistant");
  if (turnErr) throw turnErr;

  const uniqueIds = [...new Set((turnRows || []).map((row) => row.conversation_id))];
  if (uniqueIds.length === 0) return [];

  const { data: conversations, error: convErr } = await supabase
    .from("ask_viv_conversations")
    .select("id, title, updated_at")
    .in("id", uniqueIds)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (convErr) throw convErr;

  return conversations || [];
}
