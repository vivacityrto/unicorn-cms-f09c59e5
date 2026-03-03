import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useEffect, useState } from "react";

export interface ConversationThread {
  id: string;
  tenant_id: number;
  topic: string;
  type: string;
  subject: string | null;
  related_entity: string | null;
  related_entity_id: string | null;
  status: string;
  created_by_user_uuid: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  // computed client-side
  isUnread: boolean;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

export function useClientCommunications() {
  const { activeTenantId } = useClientTenant();
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // Fetch conversations for this tenant
  const conversationsQuery = useQuery({
    queryKey: ["client-conversations", activeTenantId],
    queryFn: async (): Promise<ConversationThread[]> => {
      if (!activeTenantId || !currentUserId) return [];

      const { data: convos, error } = await (supabase
        .from("tenant_conversations" as any)
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("last_message_at", { ascending: false, nullsFirst: false })) as any;

      if (error) throw error;
      if (!convos?.length) return [];

      // Get participant read status for current user
      const convoIds = convos.map((c: any) => c.id);
      const { data: participants } = await (supabase
        .from("conversation_participants" as any)
        .select("conversation_id, last_read_at")
        .eq("user_id", currentUserId)
        .in("conversation_id", convoIds)) as any;

      const readMap = new Map<string, string | null>();
      (participants || []).forEach((p: any) => readMap.set(p.conversation_id, p.last_read_at));

      return convos.map((c: any) => ({
        ...c,
        isUnread: c.last_message_at
          ? !readMap.has(c.id) || !readMap.get(c.id) || new Date(c.last_message_at) > new Date(readMap.get(c.id)!)
          : false,
      }));
    },
    enabled: !!activeTenantId && !!currentUserId,
  });

  // Fetch messages for a specific conversation
  const useConversationMessages = (conversationId: string | null) => {
    return useQuery({
      queryKey: ["conversation-messages", conversationId],
      queryFn: async (): Promise<ConversationMessage[]> => {
        if (!conversationId) return [];

        const { data, error } = await (supabase
          .from("messages" as any)
          .select("id, conversation_id, sender_id, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })) as any;

        if (error) throw error;
        if (!data?.length) return [];

        // Fetch sender names
        const senderIdSet = new Set<string>();
        data.forEach((m: any) => senderIdSet.add(m.sender_id));
        const senderIds = Array.from(senderIdSet);
        const { data: users } = await (supabase
          .from("users")
          .select("user_uuid, first_name, last_name")
          .in("user_uuid", senderIds)) as any;

        const nameMap = new Map<string, string>();
        (users || []).forEach((u: any) => {
          nameMap.set(u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown");
        });

        return data.map((m: any) => ({
          ...m,
          sender_name: nameMap.get(m.sender_id) || "Unknown",
        }));
      },
      enabled: !!conversationId,
    });
  };

  // Send a message
  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (!currentUserId || !activeTenantId) throw new Error("Not authenticated");

      const { error } = await (supabase
        .from("messages" as any)
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body,
          tenant_id: activeTenantId,
        } as any)) as any;

      if (error) throw error;

      // Update last_read_at for sender
      await (supabase
        .from("conversation_participants" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)) as any;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["conversation-messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
    },
  });

  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async ({
      subject,
      type = "general",
      firstMessage,
      relatedEntity,
      relatedEntityId,
    }: {
      subject?: string;
      type?: string;
      firstMessage: string;
      relatedEntity?: string;
      relatedEntityId?: string;
    }) => {
      if (!currentUserId || !activeTenantId) throw new Error("Not authenticated");

      // Create conversation
      const { data: conv, error: convError } = await (supabase
        .from("tenant_conversations" as any)
        .insert({
          tenant_id: activeTenantId,
          topic: subject || "General",
          type,
          subject: subject || null,
          related_entity: relatedEntity || null,
          related_entity_id: relatedEntityId || null,
          created_by_user_uuid: currentUserId,
          status: "open",
        } as any)
        .select("id")
        .single()) as any;

      if (convError) throw convError;
      const conversationId = conv.id;

      // Add client as participant
      await (supabase
        .from("conversation_participants" as any)
        .insert({
          conversation_id: conversationId,
          user_id: currentUserId,
          role: "client",
          last_read_at: new Date().toISOString(),
        } as any)) as any;

      // Look up primary CSC
      const { data: cscAssignment } = await (supabase
        .from("tenant_csc_assignments" as any)
        .select("csc_user_id")
        .eq("tenant_id", activeTenantId)
        .eq("is_primary", true)
        .maybeSingle()) as any;

      if (cscAssignment?.csc_user_id) {
        await (supabase
          .from("conversation_participants" as any)
          .insert({
            conversation_id: conversationId,
            user_id: cscAssignment.csc_user_id,
            role: "csc",
          } as any)) as any;
      }

      // Send first message
      await (supabase
        .from("messages" as any)
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body: firstMessage,
          tenant_id: activeTenantId,
        } as any)) as any;

      return conversationId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
    },
  });

  // Mark a conversation as read
  const markRead = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!currentUserId) return;
      const { error } = await (supabase
        .from("conversation_participants" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
    },
  });

  const conversations = conversationsQuery.data || [];
  const totalUnread = conversations.filter((c) => c.isUnread).length;

  return {
    conversations,
    totalUnread,
    isLoading: conversationsQuery.isLoading,
    useConversationMessages,
    sendMessage,
    createConversation,
    markRead,
    currentUserId,
  };
}
