import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
  [key: string]: any;
}

interface UseTenantsBasicParams {
  page?: number;
  pageSize?: number;
}

/**
 * Fetches a paginated page of tenants ordered by name.
 * Page indices are 0-based.
 */
export function useTenantsBasic({ page = 0, pageSize = 100 }: UseTenantsBasicParams = {}) {
  const query = useQuery({
    queryKey: ["tenants", "basic", page, pageSize],
    queryFn: async (): Promise<TenantBasic[]> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("name")
        .range(from, to);
      if (error) throw error;
      return (data || []) as TenantBasic[];
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const hasMore = (query.data?.length ?? 0) === pageSize;

  return {
    ...query,
    hasMore,
  };
}
