import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import type { PackageActivity } from '@/components/client/package-dashboard/packageActivity';

type UntypedRpc = (fn: string, params: Record<string, number>) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Aggregated activity for one package (hours by day and work type, weekly touchpoint counts, task and document counts)
 * from get_client_package_activity. The function checks the tenant against both the package and the caller, and
 * returns no notes, names or internal detail. Not in the generated types yet, hence the cast.
 */
export function useClientPackageActivity(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ['client_package_activity', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<PackageActivity> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc('get_client_package_activity', {
        p_tenant_id: activeTenantId as number,
        p_package_instance_id: packageInstanceId as number,
      });
      if (error) throw new Error(error.message);
      return data as PackageActivity;
    },
  });
}
