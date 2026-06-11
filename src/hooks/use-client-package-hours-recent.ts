import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of v_client_package_hours_recent — most recent up-to-10 time entries
 * per package_instance. Client-facing fields only: no user_id.
 * `is_billable` is exposed so the UI can badge non-billable ("Included")
 * entries; non-billable time is excluded from all package-hour aggregates.
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

const VIEW = 'v_client_package_hours_recent';

/**
 * SECURITY: Explicit tenant_id filter is required because internal staff bypass
 * tenant RLS via get_current_user_tenant_id(). Mirrors useClientPackageDashboard.
 */
export function useClientPackageHoursRecent(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_hours_recent', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientPackageHoursRecentRow[]> => {
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
                ) => Promise<{ data: ClientPackageHoursRecentRow[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      })
        .from(VIEW)
        .select('*')
        .eq('tenant_id', activeTenantId)
        .eq('package_instance_id', packageInstanceId)
        .order('rank_in_package', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as ClientPackageHoursRecentRow[];
    },
  });
}
