import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Count of OPEN conversations (`tenant_conversations.status = 'open'`)
 * assigned to the current staff user across ALL tenants.
 *
 * Powers the sidebar badge so a CSC can see at a glance how many
 * conversations they currently own and need to action.
 */
export function useMyAssignedConversationsCount() {
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) =>
      setCurrentUserId(data.user?.id ?? null)
    );
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["my-assigned-conversations-count", currentUserId] });

    const channel = supabase
      .channel(`my-assigned-conversations:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenant_conversations" },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, qc]);

  const { data: count = 0 } = useQuery({
    queryKey: ["my-assigned-conversations-count", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return 0;
      const { count, error } = await supabase
        .from("tenant_conversations")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to_user_uuid", currentUserId)
        .eq("status", "open");
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });

  return count;
}
