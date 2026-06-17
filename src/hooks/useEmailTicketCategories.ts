import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_STALE_TIMES } from "@/lib/queryConfig";

export interface EmailTicketCategory {
  value: string;
  label: string;
}

export function useEmailTicketCategories() {
  return useQuery({
    queryKey: ["dd-email-ticket-category"],
    queryFn: async (): Promise<EmailTicketCategory[]> => {
      const { data, error } = await (supabase as any)
        .from("dd_email_ticket_category")
        .select("value, label, sort_order, is_active")
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.is_active !== false)
        .map((r) => ({ value: r.value, label: r.label }));
    },
    staleTime: QUERY_STALE_TIMES.STATIC,
  });
}

export function useEmailTicketStatuses() {
  return useQuery({
    queryKey: ["dd-email-ticket-status"],
    queryFn: async (): Promise<EmailTicketCategory[]> => {
      const { data, error } = await (supabase as any)
        .from("dd_email_ticket_status")
        .select("value, label, sort_order, is_active")
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.is_active !== false)
        .map((r) => ({ value: r.value, label: r.label }));
    },
    staleTime: QUERY_STALE_TIMES.STATIC,
  });
}
