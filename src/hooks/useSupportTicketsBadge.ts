import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Tickets that still need triage: new and unassigned. RLS limits this to what the signed-in staff member can see. */
export function useSupportTicketsBadge() {
  const { data: count = 0 } = useQuery({
    queryKey: ["support-tickets-badge"],
    queryFn: async () => {
      const { count: n, error } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .is("assignee_id", null)
        .is("deleted_at", null);
      if (error) return 0;
      return n ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return count;
}
