import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientTreeRow = {
  tenant_id: number;
  package_id: number;
  package_instance_id: number;
  package_name: string;
  stage_id: number;
  stage_name: string;
  templated_doc_count: number;
};

/**
 * Server-side eligibility tree for targeted-mode bulk generation.
 *
 * Backed by public.get_bulk_generate_client_tree(p_tenant_ids bigint[]).
 * Excludes zero-templated-doc rows via HAVING inside the function — never
 * compose the predicate client-side.
 */
export function useBulkGenerateClientTree(tenantIds: number[]) {
  const key = tenantIds.length ? [...tenantIds].sort((a, b) => a - b) : [];
  return useQuery({
    queryKey: ["bulk-generate", "client-tree", key],
    enabled: key.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTreeRow[]> => {
      const { data, error } = await supabase.rpc(
        "get_bulk_generate_client_tree",
        { p_tenant_ids: key },
      );
      if (error) throw error;
      return (data ?? []) as ClientTreeRow[];
    },
  });
}
