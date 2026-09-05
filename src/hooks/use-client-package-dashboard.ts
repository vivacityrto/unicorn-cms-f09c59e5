import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

/**
 * One row of the v_client_package_dashboard view (Week-1 client packages dashboard).
 */
export interface ClientPackageDashboardRow {
  package_instance_id: number;
  tenant_id: number;
  package_name: string | null;
  package_type: string | null;
  progress_mode: string | null;
  manager_id: string | null;
  is_complete: boolean | null;
  start_date: string | null;
  end_date: string | null;

  hours_included: number;
  hours_added: number;
  hours_total: number;
  hours_used: number;
  hours_remaining: number;
  hours_pct_used: number;

  stages_total: number;
  stages_complete: number;
  current_stage_sortorder: number | null;
  current_stage_shortname: string | null;

  open_tasks: number;
  overdue_tasks: number;

  last_activity_at: string | null;

  pinned_note_title: string | null;
  pinned_note_text: string | null;
  pinned_note_priority: string | null;
  pinned_note_updated_at: string | null;
  pinned_note_severity: 'hold' | 'urgent' | 'info' | null;

  status_pill: 'on_track' | 'drifting' | 'stuck' | 'on_hold' | 'complete';
}

const VIEW = 'v_client_package_dashboard';

/**
 * Fetch the dashboard row for a single package instance.
 *
 * SECURITY: Explicit tenant_id filter is required because staff bypass tenant
 * RLS via get_current_user_tenant_id(). Without this filter a staff member
 * impersonating a client could read other tenants' rows. Mirrors the
 * useReleasedAudits pattern shipped on 1 May.
 */
export function useClientPackageDashboard(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_dashboard', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ClientPackageDashboardRow | null> => {
      if (!activeTenantId || !packageInstanceId) return null;

      const { data, error } = await supabase
        .rpc('get_client_package_dashboard', {
          p_tenant_id: activeTenantId,
          p_package_instance_id: packageInstanceId,
        })
        .maybeSingle();

      if (error) throw error;
      return (data as ClientPackageDashboardRow | null) ?? null;
    },
  });
}

/**
 * List variant — every package the active tenant owns.
 */
export function useClientPackageDashboards() {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_dashboards', activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ClientPackageDashboardRow[]> => {
      if (!activeTenantId) return [];

      const { data, error } = await supabase
        .rpc('get_client_package_dashboard', {
          p_tenant_id: activeTenantId,
          p_package_instance_id: null,
        });

      if (error) throw error;
      return (data ?? []) as ClientPackageDashboardRow[];
    },
  });
}
