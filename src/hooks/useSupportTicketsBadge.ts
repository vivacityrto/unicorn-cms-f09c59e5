import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSupportTicketsBadge() {
  const { data: count = 0 } = useQuery({
    queryKey: ["support-tickets-badge"],
    queryFn: async () => {
      const { data: threads, error } = await supabase
        .from("help_threads")
        .select("id")
        .eq("channel", "support")
        .eq("status", "open");
      if (error || !threads?.length) return 0;

      const ids = threads.map((t) => t.id);
      const { data: staffMsgs } = await supabase
        .from("help_messages")
        .select("thread_id")
        .eq("role", "staff")
        .in("thread_id", ids);

      const answered = new Set((staffMsgs || []).map((m) => m.thread_id));
      return threads.filter((t) => !answered.has(t.id)).length;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return count;
}
