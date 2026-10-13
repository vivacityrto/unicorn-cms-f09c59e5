import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of get_client_package_hours_recent — every time log entry in the
 * package's current renewal cycle, newest first. Client-facing fields only: no
 * user_id. `duration_minutes`/`hours` are the minutes credited to THIS package
 * (so the list sums to the "Where your hours went" total). `is_billable` lets
 * the UI badge non-billable ("Included") entries; non-billable time is excluded
 * from all package-hour aggregates.
 * Powers the "Recent work" panel inside PackageCard.
 */
export interface ClientPackageHoursRecentRow {
  entry_id: string;          // uuid
  package_instance_id: number;
  tenant_id: number;
  occurred_at: string;       // ISO timestamp
  duration_minutes: number;
  hours: number;
  work_type: string;
  work_sub_type: string | null;
  notes: string | null;
  rank_in_package: number;   // 1 = most recent
  is_billable: boolean;
}

/**
 * SECURITY: tenant-gated SECURITY DEFINER RPC — see useClientPackageHoursByType
 * for why the old security_invoker view returned nothing to real client users.
 */
export function useClientPackageHoursRecent(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_hours_recent', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientPackageHoursRecentRow[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      const { data, error } = await supabase.rpc('get_client_package_hours_recent', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: packageInstanceId,
      });

      if (error) throw new Error(error.message);
      return (data ?? []) as ClientPackageHoursRecentRow[];
    },
  });
}
