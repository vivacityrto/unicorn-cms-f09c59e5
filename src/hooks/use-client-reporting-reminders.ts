import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export type ReminderStatus =
  | "always_open"
  | "overdue"
  | "due_soon"
  | "upcoming"
  | "no_date";
export type ReminderRecurrence =
  | "annual_fixed"
  | "annual_window"
  | "rolling_per_tenant"
  | "always_open";
export type ReminderAudience = "rto" | "cricos" | "rto_or_cricos";

export interface ClientReportingReminder {
  tenant_id: number;
  obligation_id: number;
  code: string;
  title: string;
  description: string;
  audience: ReminderAudience;
  recurrence: ReminderRecurrence;
  next_date: string | null;
  window_opens_at: string | null;
  cta_label: string;
  cta_url: string;
  sort_order: number;
  days_until: number | null;
  status: ReminderStatus;
}

export function useClientReportingReminders() {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ["client_reporting_reminders", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ClientReportingReminder[]> => {
      const { data, error } = await supabase
        .from("v_client_reporting_reminders")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClientReportingReminder[];
    },
  });
}
