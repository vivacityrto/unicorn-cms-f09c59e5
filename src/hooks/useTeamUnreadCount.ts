import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Vivacity team Communications nav badge.
 *
 * Source of truth: rows in `conversation_participants` for the current user.
 * A conversation counts as unread iff its parent `tenant_conversations` row has
 * `last_message_at IS NOT NULL` AND (`last_read_at IS NULL` OR
 * `last_message_at > last_read_at`).
 *
 * Conversations the staff user can see via RLS but has never joined as a
 * participant are deliberately excluded — they have no `last_read_at` and
 * would otherwise inflate the badge for every staff user.
 */
interface UnreadRow {
  conversation_id: string;
  last_read_at: string | null;
  tenant_conversations: { last_message_at: string | null } | null;
}

export function useTeamUnreadCount() {
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) =>
      setCurrentUserId(data.user?.id ?? null)
    );
  }, []);

  // Realtime: re-query when a conversation gets a new message OR when the
  // current user's own participant row changes (mark-as-read).
  useEffect(() => {
    if (!currentUserId) return;

    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["team-unread-count", currentUserId] });

    const convoChannel = supabase
      .channel("team-unread-badge-convos")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tenant_conversations" },
        invalidate
      )
      .subscribe();

    const participantChannel = supabase
      .channel("team-unread-badge-participants")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${currentUserId}`,
        },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convoChannel);
      supabase.removeChannel(participantChannel);
    };
  }, [currentUserId, qc]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["team-unread-count", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return 0;

      // Drive the count from participation. `!inner` enforces the join so
      // rows with no parent conversation are dropped, and the embedded
      // `.not(...)` keeps only conversations that have any messages.
      const { data: rows, error } = await supabase
        .from("conversation_participants")
        .select<
          "conversation_id, last_read_at, tenant_conversations!inner(last_message_at)",
          UnreadRow
        >("conversation_id, last_read_at, tenant_conversations!inner(last_message_at)")
        .eq("user_id", currentUserId)
        .not("tenant_conversations.last_message_at", "is", null);

      if (error || !rows?.length) return 0;

      return rows.filter((r) => {
        const lastMessageAt = r.tenant_conversations?.last_message_at;
        if (!lastMessageAt) return false;
        if (!r.last_read_at) return true;
        return new Date(lastMessageAt) > new Date(r.last_read_at);
      }).length;
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });

  return unreadCount;
}
