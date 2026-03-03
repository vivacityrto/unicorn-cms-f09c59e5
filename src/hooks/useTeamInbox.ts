import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { InboxItem, InboxFilterType } from "@/types/inbox";

interface UseTeamInboxOptions {
  filter?: InboxFilterType;
  tenantId?: number | null;
  actionRequiredOnly?: boolean;
}

export function useTeamInbox({ filter = "all", tenantId, actionRequiredOnly }: UseTeamInboxOptions = {}) {
  const { user } = useAuth();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["team-inbox", user?.id, filter, tenantId, actionRequiredOnly],
    queryFn: async () => {
      if (!user?.id) return [];

      const params: Record<string, unknown> = {
        p_user_id: user.id,
        p_limit: 100,
        p_offset: 0,
      };
      if (filter !== "all") params.p_item_type = filter;
      if (tenantId) params.p_tenant_id = tenantId;
      if (actionRequiredOnly) params.p_action_required = true;

      const { data, error } = await (supabase.rpc as any)("rpc_get_inbox_items", params);
      if (error) throw error;
      return (data || []) as unknown as InboxItem[];
    },
    enabled: !!user?.id,
  });

  const unreadCount = items.filter((i) => i.unread).length;
  const actionCount = items.filter((i) => i.action_required).length;

  return { items, isLoading, error, unreadCount, actionCount };
}
