import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import type { InboxItem, InboxFilterType } from "@/types/inbox";

export function useClientInbox(filter: InboxFilterType = "all") {
  const { activeTenantId } = useClientTenant();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["client-inbox", activeTenantId, filter],
    queryFn: async () => {
      if (!activeTenantId) return [];

      const params: Record<string, unknown> = {
        p_tenant_id: activeTenantId,
        p_limit: 100,
        p_offset: 0,
      };
      if (filter !== "all") {
        params.p_item_type = filter;
      }

      const { data, error } = await (supabase.rpc as any)("rpc_get_inbox_items", params);
      if (error) throw error;
      return (data || []) as unknown as InboxItem[];
    },
    enabled: !!activeTenantId,
  });

  const unreadCount = items.filter((i) => i.unread).length;
  const actionCount = items.filter((i) => i.action_required).length;

  return { items, isLoading, error, unreadCount, actionCount };
}
