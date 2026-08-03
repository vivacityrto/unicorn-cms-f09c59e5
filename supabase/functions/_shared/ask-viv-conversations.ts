/**
 * Ask Viv Conversation Helpers (shared)
 *
 * Extracted from compliance-assistant's Phase 5 implementation so both the
 * existing compliance-assistant and the new ask-viv-assistant edge function
 * use one implementation of conversation resolution/turn logging, not two
 * copies. Behaviour is unchanged from the original.
 */

/**
 * Resolve an existing conversation (if the caller passed one they actually
 * own) or create a new one. Conversation history is a convenience layer, not
 * the audit trail — a failure to create/verify one never fails the request;
 * it falls back to a fresh in-memory id so turn logging still has somewhere
 * consistent to point, even if no row ends up persisted.
 */
export async function resolveOrCreateConversation(
  supabase: any,
  userId: string,
  tenantId: number | null,
  requestedConversationId: string | null | undefined,
  firstMessage: string
): Promise<string> {
  if (requestedConversationId) {
    const { data } = await supabase
      .from("ask_viv_conversations")
      .select("id")
      .eq("id", requestedConversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      await supabase
        .from("ask_viv_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", requestedConversationId);
      return requestedConversationId;
    }
    // Requested id doesn't exist or isn't owned by this user — fall through
    // and start a fresh conversation rather than failing the request.
  }

  const title = firstMessage.length > 80 ? `${firstMessage.slice(0, 77)}...` : firstMessage;
  const { data: created, error } = await supabase
    .from("ask_viv_conversations")
    .insert({ user_id: userId, tenant_id: tenantId, title })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Failed to create ask_viv_conversations row:", error);
    return crypto.randomUUID();
  }
  return created.id;
}

/** Best-effort turn log. Never fails the request — conversation history is a convenience layer, not the audit trail. */
export async function logTurn(
  supabase: any,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  mode: string = "compliance"
): Promise<void> {
  try {
    const { error } = await supabase
      .from("ask_viv_turns")
      .insert({ conversation_id: conversationId, role, content, mode });
    if (error) {
      console.error(`Failed to log ${role} turn:`, error);
    }
  } catch (err) {
    console.error(`Failed to log ${role} turn:`, err);
  }
}

/**
 * Fetch a conversation's stored summarization state plus its most recent
 * raw turns, for building a bounded prompt context. Returns turns oldest
 * to newest.
 */
export async function loadConversationContext(
  supabase: any,
  conversationId: string,
  recentTurnLimit: number
): Promise<{
  contextSummary: string | null;
  summaryCoversTurns: number;
  recentTurns: { role: "user" | "assistant"; content: string; created_at: string }[];
}> {
  const { data: convo } = await supabase
    .from("ask_viv_conversations")
    .select("context_summary, context_summary_covers_turns")
    .eq("id", conversationId)
    .maybeSingle();

  const { data: turns } = await supabase
    .from("ask_viv_turns")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(recentTurnLimit);

  return {
    contextSummary: convo?.context_summary ?? null,
    summaryCoversTurns: convo?.context_summary_covers_turns ?? 0,
    recentTurns: (turns ?? []).reverse(),
  };
}
