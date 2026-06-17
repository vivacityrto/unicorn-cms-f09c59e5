import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ZeroProgressTriage = 'pre_release' | 'dormant' | 'investigate' | 'review';

export interface ZeroProgressPackageRow {
  package_instance_id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_legal_name: string | null;
  package_name: string;
  package_type: string | null;
  manager_id: string | null;
  start_date: string;
  end_date: string | null;
  days_since_start: number;
  is_active: boolean;
  is_complete: boolean | null;
  stages_total: number;
  stages_complete: number;
  
  action_items_total: number;
  action_items_completed: number;
  legacy_tasks_total: number;
  legacy_tasks_completed: number;
  legacy_tasks_open: number;
  hours_logged: number;
  last_activity_at: string;
  triage_category: ZeroProgressTriage;
}

export function useAdminZeroProgressPackages() {
  return useQuery({
    queryKey: ['admin_zero_progress_packages'],
    staleTime: 60_000,
    queryFn: async (): Promise<ZeroProgressPackageRow[]> => {
      const { data, error } = await supabase
        .from('v_admin_zero_progress_packages' as never)
        .select('*')
        .order('last_activity_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ZeroProgressPackageRow[];
    },
  });
}
