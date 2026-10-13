import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of get_client_package_hours_timeline — per-package daily hours,
 * sparse (only days with activity), with a running cumulative total.
 * Powers the burndown chart inside PackageCard.
 */
export interface ClientPackageHoursTimelinePoint {
  package_instance_id: number;
  tenant_id: number;
  activity_date: string;          // ISO date 'YYYY-MM-DD' (Australia/Sydney bucketed)
  hours_on_day: number;
  cumulative_hours_used: number;
  point_rank: number;
}

/**
 * SECURITY: tenant-gated SECURITY DEFINER RPC — see useClientPackageHoursByType
 * for why the old security_invoker view returned nothing to real client users.
 */
export function useClientPackageHoursTimeline(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_hours_timeline', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientPackageHoursTimelinePoint[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      const { data, error } = await supabase.rpc('get_client_package_hours_timeline', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: packageInstanceId,
      });

      if (error) throw new Error(error.message);
      return (data ?? []) as ClientPackageHoursTimelinePoint[];
    },
  });
}
