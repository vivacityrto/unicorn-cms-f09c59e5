import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

export interface ConversationThread extends Tables<"tenant_conversations"> {
  // computed client-side
  isUnread: boolean;
}

export interface ConversationMessageAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  /** Aliased from tenant_messages.sender_user_uuid for backward compatibility. */
  sender_id: string;
  sender_type?: string | null;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_avatar_url: string | null;
  attachments?: ConversationMessageAttachment[];
}

/**
 * Subscribe to realtime INSERTs on tenant_messages for a single conversation
 * and invalidate the relevant queries on every event.
 */
export function useConversationRealtime(conversationId: string | null) {
  const qc = useQueryClient();
  const { isAcademyOnly } = useClientTenant();
  useEffect(() => {
    if (!conversationId || isAcademyOnly) return;
    const channel = supabase
      .channel(`conv-live:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["client-conversations"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc, isAcademyOnly]);
}

export function useClientCommunications() {
  const { activeTenantId, isAcademyOnly } = useClientTenant();
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

      const { data: convos, error } = await supabase
        .from("tenant_conversations")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      if (!convos?.length) return [];

      const convoIds = convos.map((c) => c.id);
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", currentUserId)
        .in("conversation_id", convoIds);

      const readMap = new Map<string, string | null>();
      (participants || []).forEach((p) => readMap.set(p.conversation_id, p.last_read_at));

      return convos.map((c) => ({
        ...c,
        isUnread: c.last_message_at
          ? !readMap.has(c.id) ||
            !readMap.get(c.id) ||
            new Date(c.last_message_at) > new Date(readMap.get(c.id)!)
          : false,
      }));
    },
    enabled: !!activeTenantId && !!currentUserId && !isAcademyOnly,
  });

  // Fetch messages for a specific conversation
  const useConversationMessages = (conversationId: string | null) => {
    // Realtime keeps this conversation's message list fresh.
    useConversationRealtime(conversationId);

    return useQuery({
      queryKey: ["conversation-messages", conversationId],
      queryFn: async (): Promise<ConversationMessage[]> => {
        if (!conversationId) return [];

        const { data, error } = await supabase
          .from("tenant_messages")
          .select("id, conversation_id, sender_user_uuid, sender_type, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (!data?.length) return [];

        const senderIds = Array.from(new Set(data.map((m) => m.sender_user_uuid)));
        const { data: users } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name, avatar_url")
          .in("user_uuid", senderIds);

        const nameMap = new Map<string, string>();
        const avatarMap = new Map<string, string | null>();
        (users || []).forEach((u) => {
          nameMap.set(
            u.user_uuid,
            [u.first_name, u.last_name].filter(Boolean).join(" ")
          );
          avatarMap.set(u.user_uuid, u.avatar_url ?? null);
        });

        const messageIds = data.map((m) => m.id);
        const attMap = new Map<string, ConversationMessageAttachment[]>();
        if (messageIds.length > 0) {
          const { data: attRows } = await supabase
            .from("tenant_message_attachments")
            .select("*")
            .in("message_id", messageIds);
          (attRows || []).forEach((a) => {
            const arr = attMap.get(a.message_id) || [];
            arr.push(a as ConversationMessageAttachment);
            attMap.set(a.message_id, arr);
          });
        }

        const mapped: ConversationMessage[] = data.map((m) => {
          const resolved = nameMap.get(m.sender_user_uuid) || "";
          const fallback = m.sender_type === "staff" ? "Vivacity Team" : "Unknown";
          return {
            id: m.id,
            conversation_id: m.conversation_id,
            sender_id: m.sender_user_uuid,
            sender_type: m.sender_type ?? null,
            body: m.body,
            created_at: m.created_at,
            sender_name: resolved || fallback,
            sender_avatar_url: avatarMap.get(m.sender_user_uuid) ?? null,
            attachments: attMap.get(m.id) || [],
          };
        });

        return mapped;
      },
      enabled: !!conversationId && !isAcademyOnly,
    });
  };

  // Send a message
  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (isAcademyOnly) throw new Error("Conversations are not available for academy-only users");
      if (!currentUserId || !activeTenantId) throw new Error("Not authenticated");

      const { data: newMsg, error } = await supabase
        .from("tenant_messages")
        .insert({
          conversation_id: conversationId,
          sender_user_uuid: currentUserId,
          sender_type: "client",
          body,
          tenant_id: activeTenantId,
        })
        .select("id")
        .single();

      if (error) throw error;

      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId);

      return { messageId: newMsg.id, tenantId: activeTenantId };
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
      if (isAcademyOnly) throw new Error("Conversations are not available for academy-only users");
      if (!currentUserId || !activeTenantId) throw new Error("Not authenticated");

      const { data: conv, error: convError } = await supabase
        .from("tenant_conversations")
        .insert({
          tenant_id: activeTenantId,
          topic: "general",
          type,
          subject: subject || null,
          related_entity: relatedEntity || null,
          related_entity_id: relatedEntityId || null,
          created_by_user_uuid: currentUserId,
          status: "open",
        })
        .select("id")
        .single();

      if (convError) throw convError;
      const conversationId = conv.id;

      // Sender must be a participant before INSERT to tenant_messages (RLS).
      const { error: selfPartError } = await supabase
        .from("conversation_participants")
        .upsert(
          {
            conversation_id: conversationId,
            user_id: currentUserId,
            role: "client",
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id,user_id" }
        );
      if (selfPartError) throw selfPartError;

      const { data: cscAssignment } = await supabase
        .from("tenant_csc_assignments")
        .select("csc_user_id")
        .eq("tenant_id", activeTenantId)
        .eq("is_primary", true)
        .maybeSingle();

      if (cscAssignment?.csc_user_id) {
        await supabase
          .from("conversation_participants")
          .upsert(
            {
              conversation_id: conversationId,
              user_id: cscAssignment.csc_user_id,
              role: "csc",
            },
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
          );
      }

      const { error: msgError } = await supabase
        .from("tenant_messages")
        .insert({
          conversation_id: conversationId,
          sender_user_uuid: currentUserId,
          sender_type: "client",
          body: firstMessage,
          tenant_id: activeTenantId,
        });
      if (msgError) throw msgError;

      return conversationId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
    },
  });

  // Mark a conversation as read
  const markRead = useMutation({
    mutationFn: async (conversationId: string) => {
      if (isAcademyOnly) return;
      if (!currentUserId) return;
      const { error } = await supabase.rpc("fn_mark_conversation_read", {
        p_conversation_id: conversationId,
      });
      if (error) throw error;

      try {
        await supabase
          .from("user_notifications")
          .update({ is_read: true })
          .eq("user_id", currentUserId)
          .eq("source_id", conversationId)
          .eq("is_read", false);
      } catch { /* best-effort; the conversation is already marked read via RPC above */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-conversations"] });
      qc.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const conversations = isAcademyOnly ? [] : (conversationsQuery.data || []);
  const totalUnread = isAcademyOnly ? 0 : conversations.filter((c) => c.isUnread).length;

  return {
    conversations,
    totalUnread,
    isLoading: isAcademyOnly ? false : conversationsQuery.isLoading,
    useConversationMessages,
    sendMessage,
    createConversation,
    markRead,
    currentUserId,
  };
}
