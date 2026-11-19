import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TenantCheckinsOverview } from '@/components/client/checkins-staff/tenantCheckins';

type UntypedRpc = (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Staff view of one organisation's client check-ins (get_tenant_checkins_overview). The function refuses anyone who
 * is not Vivacity staff or a super admin. Not in the generated types yet, hence the cast.
 */
export function useTenantCheckins(tenantId: number | null) {
  return useQuery({
    queryKey: ['tenant-checkins-overview', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantCheckinsOverview> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc('get_tenant_checkins_overview', { p_tenant_id: tenantId });
      if (error) throw new Error(error.message);
      return (data ?? { packages: [] }) as TenantCheckinsOverview;
    },
  });
}
