import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';

export type TaskUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'recurring' | 'untimed';

export interface ClientPackageWhatsNextRow {
  package_instance_id: number;
  tenant_id: number;
  task_uid: string;
  source: 'action_item' | 'task_instance';
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string | null;
  urgency: TaskUrgency;
  urgency_rank: number;
  rank_in_package: number;
  created_at: string;
  updated_at: string;
}

const VIEW = 'v_client_package_whats_next';

/**
 * Top three open client-facing tasks for a single package_instance.
 *
 * SECURITY: Explicit tenant_id filter required because staff bypass tenant RLS
 * via get_current_user_tenant_id(). Mirrors useClientPackageDashboard.
 */
export function useClientPackageWhatsNext(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();

  return useQuery({
    queryKey: ['client_package_whats_next', activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientPackageWhatsNextRow[]> => {
      if (!activeTenantId || !packageInstanceId) return [];

      const { data, error } = await supabase
        .from(VIEW)
        .select('*')
        .eq('tenant_id', activeTenantId)
        .eq('package_instance_id', packageInstanceId)
        .order('rank_in_package', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ClientPackageWhatsNextRow[];
    },
  });
}
