import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRouteTenantContext } from "@/hooks/useRouteTenantContext";

export interface AssistantSourceUsed {
  tool: string;
  summary: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources_used?: AssistantSourceUsed[];
  created_at: string;
}

export interface AssistantConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

/**
 * Shared chat logic for Ask Viv Assistant — used by both the floating
 * launcher and the dedicated full page, so send/receive/persist logic
 * exists exactly once. Both surfaces read/write the same
 * ask_viv_conversations/ask_viv_turns tables (mode: "assistant"), so a
 * conversation started in one is visible/continuable from the other.
 */
export function useAskVivAssistantChat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [conversationList, setConversationList] = useState<AssistantConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // What client (if any) the user is currently viewing, resolved from the
  // route — sent as a hint on every message so the assistant doesn't need to
  // be told explicitly which client "they"/"this client" refers to.
  const { tenantId: pageTenantId, tenantName: pageTenantName } = useRouteTenantContext();

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  // ask_viv_conversations has no "surface" column of its own — a conversation
  // can have tenant_id null both for this assistant AND for the existing
  // panel's portfolio scope, so filtering on tenant_id alone would mix the
  // two. ask_viv_turns.mode is the reliable discriminator ("assistant" here
  // vs "compliance" for the existing panel), so resolve distinct
  // conversation ids from turns first, then fetch those conversations.
  const loadConversationHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data: turnRows, error: turnErr } = await supabase
        .from("ask_viv_turns")
        .select("conversation_id")
        .eq("mode", "assistant");
      if (turnErr) throw turnErr;

      const uniqueIds = [...new Set((turnRows || []).map((r: any) => r.conversation_id))];
      if (uniqueIds.length === 0) {
        setConversationList([]);
        return;
      }

      const { data: conversations, error: convErr } = await supabase
        .from("ask_viv_conversations")
        .select("id, title, updated_at")
        .in("id", uniqueIds)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (convErr) throw convErr;

      setConversationList(conversations || []);
    } catch (err) {
      console.error("Failed to load Ask Viv Assistant conversation history:", err);
      setConversationList([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("ask_viv_turns")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    setMessages(
      (data || []).map((t: any) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        created_at: t.created_at,
      }))
    );
    setConversationId(id);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("ask_viv_conversations").delete().eq("id", id);
      if (error) throw error;
      setConversationList((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        startNewConversation();
      }
    },
    [conversationId, startNewConversation]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      const tempUserMessage: AssistantMessage = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);
      setIsSending(true);

      try {
        const { data, error } = await supabase.functions.invoke("ask-viv-assistant", {
          body: {
            message: trimmed,
            conversation_id: conversationId,
            page_context: pageTenantId ? { tenant_id: pageTenantId } : null,
          },
        });
        if (error) throw new Error(error.message || "Failed to get a response");

        if (data.conversation_id && data.conversation_id !== conversationId) {
          setConversationId(data.conversation_id);
        }

        const assistantMessage: AssistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.content,
          sources_used: data.sources_used,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending, pageTenantId]
  );

  return {
    conversationId,
    messages,
    isSending,
    conversationList,
    loadingHistory,
    pageTenantId,
    pageTenantName,
    startNewConversation,
    loadConversationHistory,
    openConversation,
    deleteConversation,
    sendMessage,
  };
}
