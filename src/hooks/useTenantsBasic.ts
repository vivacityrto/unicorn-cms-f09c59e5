import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantBasic {
  id: number;
  name: string;
  slug: string;
  status: string;
  lifecycle_status: string | null;
  access_status: string | null;
  risk_level: string | null;
  created_at: string;
  rto_id?: string | null;
  complyhub_membership_tier?: string | null;
  xero_invoice_paid?: boolean | null;
  xero_invoice_due_date?: string | null;
  xero_repeating_invoice_url?: string | null;
}

/**
 * Fetches ALL tenants ordered by name in a single query.
 * Pagination is intentionally removed — the dataset is small enough
 * (well under PostgREST's 1000-row default) that loading it all
 * gives accurate KPIs/CSC chips without "Load more" UX.
 */
export function useTenantsBasic() {
  return useQuery({
    queryKey: ["tenants", "basic", "all"],
    queryFn: async (): Promise<TenantBasic[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("name")
        .range(0, 9999);
      if (error) throw error;
      return (data || []) as TenantBasic[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
