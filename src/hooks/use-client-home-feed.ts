import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useMemo } from "react";

export type HomeFeedSection = "coming_up" | "needs_attention" | "recent_activity";

export type HomeFeedEventType =
  | "task_due"
  | "task_overdue"
  | "urgent_note"
  | "consult_logged"
  | "stage_completed"
  | "stage_released"
  | "task_completed";

export interface HomeFeedRow {
  feed_section: HomeFeedSection;
  event_type: HomeFeedEventType;
  tenant_id: number;
  package_instance_id: number | null;
  event_at: string;
  title: string;
  subtitle: string | null;
  event_uid: string;
  source_table: string;
  href: string;
}

export interface UseClientHomeFeedResult {
  comingUp: HomeFeedRow[];
  needsAttention: HomeFeedRow[];
  recentActivity: HomeFeedRow[];
  isLoading: boolean;
  isError: boolean;
}

export function useClientHomeFeed(): UseClientHomeFeedResult {
  const { activeTenantId } = useClientTenant();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["client_home_feed", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<HomeFeedRow[]> => {
      const { data, error } = await supabase
        .from("v_client_home_feed")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("event_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeFeedRow[];
    },
  });

  return useMemo(() => {
    const all = data ?? [];
    return {
      comingUp: all
        .filter((r) => r.feed_section === "coming_up")
        .sort((a, b) => a.event_at.localeCompare(b.event_at))
        .slice(0, 5),
      needsAttention: all
        .filter((r) => r.feed_section === "needs_attention")
        .sort((a, b) => a.event_at.localeCompare(b.event_at)),
      recentActivity: all
        .filter((r) => r.feed_section === "recent_activity")
        .sort((a, b) => b.event_at.localeCompare(a.event_at))
        .slice(0, 8),
      isLoading,
      isError,
    };
  }, [data, isLoading, isError]);
}
