import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTeamUnreadCount() {
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) =>
      setCurrentUserId(data.user?.id ?? null)
    );
  }, []);

  // Keep badge fresh when any conversation updates
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("team-unread-badge")
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "tenant_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["team-unread-count", currentUserId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, qc]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["team-unread-count", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return 0;

      const { data: convos, error } = await (supabase
        .from("tenant_conversations" as any)
        .select("id, last_message_at")
        .not("last_message_at", "is", null)) as any;
      if (error || !convos?.length) return 0;

      const convoIds = (convos as any[]).map((c: any) => c.id);
      const { data: participants } = await (supabase
        .from("conversation_participants" as any)
        .select("conversation_id, last_read_at")
        .eq("user_id", currentUserId)
        .in("conversation_id", convoIds)) as any;

      const readMap = new Map<string, string | null>();
      (participants || []).forEach((p: any) =>
        readMap.set(p.conversation_id, p.last_read_at)
      );

      return (convos as any[]).filter((c: any) => {
        if (!readMap.has(c.id)) return true;
        const lastRead = readMap.get(c.id);
        if (!lastRead) return true;
        return new Date(c.last_message_at) > new Date(lastRead);
      }).length;
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });

  return unreadCount;
}
