import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface TimelineEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
  actor_user_id: string | null;
}

/**
 * Fetches the last 10 material audit log entries for the active tenant.
 */
export function useClientActivityTimeline() {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ["client-activity-timeline", activeTenantId],
    queryFn: async (): Promise<TimelineEntry[]> => {
      if (!activeTenantId) return [];

      const { data, error } = await supabase
        .from("client_audit_log" as any)
        .select("id, action, entity_type, entity_id, details, created_at, actor_user_id")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data ?? []) as unknown as TimelineEntry[];
    },
    enabled: !!activeTenantId,
    staleTime: 30_000,
  });
}
