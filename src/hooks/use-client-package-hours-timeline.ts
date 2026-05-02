import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of v_client_package_hours_timeline — per-package daily hours,
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

const VIEW = 'v_client_package_hours_timeline';

/**
 * SECURITY: Explicit tenant_id filter is required because internal staff bypass
 * tenant RLS via get_current_user_tenant_id(). Mirrors useClientPackageHoursByType.
 */
export function useClientPackageHoursTimeline(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_hours_timeline', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientPackageHoursTimelinePoint[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      // The view is not yet present in the generated supabase types, so we
      // use a cast through `unknown` rather than leaking `any` into the codebase.
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (
              col: string,
              val: number,
            ) => {
              eq: (
                col: string,
                val: number,
              ) => {
                order: (
                  col: string,
                  opts: { ascending: boolean },
                ) => Promise<{ data: ClientPackageHoursTimelinePoint[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      })
        .from(VIEW)
        .select('*')
        .eq('tenant_id', activeTenantId)
        .eq('package_instance_id', packageInstanceId)
        .order('activity_date', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as ClientPackageHoursTimelinePoint[];
    },
  });
}
