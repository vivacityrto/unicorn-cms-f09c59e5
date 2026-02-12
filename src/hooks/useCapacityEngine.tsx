import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConsultantCapacityRow {
  user_uuid: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  weekly_assignable_hours: number;
  current_load: number;
  remaining_capacity: number;
  active_clients: number;
  overload: boolean;
}

export function useConsultantCapacityOverview() {
  return useQuery({
    queryKey: ['consultant-capacity-overview'],
    queryFn: async (): Promise<ConsultantCapacityRow[]> => {
      const { data, error } = await supabase.rpc('rpc_get_consultant_capacity_overview');
      if (error) throw error;
      
      if (Array.isArray(data)) return data as unknown as ConsultantCapacityRow[];
      if (typeof data === 'string') return JSON.parse(data) as ConsultantCapacityRow[];
      return (data as unknown as ConsultantCapacityRow[]) || [];
    },
    staleTime: 30_000,
  });
}

export interface MembershipUsage {
  included_hours_annual: number;
  hours_used_ytd: number;
  hours_remaining: number;
  percent_utilised: number;
  membership_year_start: string;
  membership_year_end: string;
  error?: string;
}

export function useMembershipUsage(tenantId: number | null) {
  return useQuery({
    queryKey: ['membership-usage', tenantId],
    queryFn: async (): Promise<MembershipUsage | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase.rpc('rpc_get_membership_usage', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.error) return null;
      return parsed as MembershipUsage;
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
