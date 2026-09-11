import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes one Ask Viv Assistant conversation. The caller owns local state
 * cleanup; this adapter preserves the existing table/filter/error contract as
 * a focused mutation boundary.
 */
export async function deleteAskVivAssistantConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("ask_viv_conversations")
    .delete()
    .eq("id", conversationId);
  if (error) throw error;
}
