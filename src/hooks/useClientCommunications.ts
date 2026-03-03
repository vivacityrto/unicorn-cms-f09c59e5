import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface ClientMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  conversationId: string;
  messages: ClientMessage[];
  latestMessage: ClientMessage;
  unreadCount: number;
}

export function useClientCommunications() {
  const { activeTenantId } = useClientTenant();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["client-communications", activeTenantId],
    queryFn: async (): Promise<Conversation[]> => {
      if (!activeTenantId) return [];

      const { data, error } = await (supabase
        .from("messages" as any)
        .select("id, conversation_id, sender_id, body, is_read, created_at")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })) as { data: any[] | null; error: any };

      if (error) throw error;
      if (!data?.length) return [];

      // Group by conversation_id
      const grouped = new Map<string, ClientMessage[]>();
      for (const msg of data as any[]) {
        const cid = msg.conversation_id || msg.id;
        if (!grouped.has(cid)) grouped.set(cid, []);
        grouped.get(cid)!.push(msg as ClientMessage);
      }

      return Array.from(grouped.entries()).map(([conversationId, messages]) => ({
        conversationId,
        messages: messages.sort((a, b) => a.created_at.localeCompare(b.created_at)),
        latestMessage: messages[0], // already sorted desc from query
        unreadCount: messages.filter((m) => !m.is_read).length,
      })).sort((a, b) => b.latestMessage.created_at.localeCompare(a.latestMessage.created_at));
    },
    enabled: !!activeTenantId,
  });

  const markConversationRead = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ is_read: true } as any)
        .eq("conversation_id", conversationId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-communications"] }),
  });

  const conversations = query.data || [];
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return {
    ...query,
    conversations,
    totalUnread,
    markConversationRead: markConversationRead.mutate,
  };
}
