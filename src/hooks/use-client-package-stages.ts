import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

export type StageNodeState = 'complete' | 'current' | 'future';

export interface ClientPackageStageRow {
  package_instance_id: number;
  tenant_id: number;
  stage_instance_id: number;
  stage_id: number;
  stage_sortorder: number;
  stage_name: string;
  stage_shortname: string;
  stage_description: string | null;
  is_recurring: boolean | null;
  is_audit_workspace: boolean;
  completion_date: string | null;
  raw_status: string | null;
  event_conducted_date: string | null;
  updated_at: string;
  node_state: StageNodeState;
}

const VIEW = 'v_client_package_stages';

/**
 * Per-package stage list for the client journey stepper.
 *
 * SECURITY: Explicit tenant_id filter required because staff bypass tenant RLS
 * via get_current_user_tenant_id(). Mirrors useClientPackageDashboard.
 */
export function useClientPackageStages(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_stages', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientPackageStageRow[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      const { data, error } = await supabase
        .from(VIEW)
        .select('*')
        .eq('tenant_id', activeTenantId)
        .eq('package_instance_id', packageInstanceId)
        .order('stage_sortorder', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ClientPackageStageRow[];
    },
  });
}
