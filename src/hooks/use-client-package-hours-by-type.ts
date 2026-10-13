import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of get_client_package_hours_by_type — per-package time totals
 * grouped by (work_type, work_sub_type). Powers the "Where your hours went"
 * panel inside PackageCard.
 */
export interface ClientPackageHoursByTypeRow {
  package_instance_id: number;
  tenant_id: number;
  work_type: string;
  work_sub_type: string | null;
  minutes: number;
  hours: number;
  pct_of_total: number;     // 0..1
  rank_in_package: number;  // 1 = largest category
}

/**
 * SECURITY: reads through a tenant-gated SECURITY DEFINER RPC, not the old
 * v_client_package_hours_by_type view. The view was security_invoker over
 * time_entries, whose RLS only admits the entry's author and Vivacity staff, so
 * a real client user saw nothing while staff using "View as client" saw
 * everything. The RPC enforces app.user_can_access_tenant() server-side and
 * returns client-facing columns only.
 */
export function useClientPackageHoursByType(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_hours_by_type', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientPackageHoursByTypeRow[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      const { data, error } = await supabase.rpc('get_client_package_hours_by_type', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: packageInstanceId,
      });

      if (error) throw new Error(error.message);
      return (data ?? []) as ClientPackageHoursByTypeRow[];
    },
  });
}
