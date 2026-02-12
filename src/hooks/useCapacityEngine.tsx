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
  tier_name?: string;
  flags?: string[];
  error?: string;
}

export function useMembershipUsage(tenantId: number | null) {
  return useQuery({
    queryKey: ['membership-usage', tenantId],
    queryFn: async (): Promise<MembershipUsage | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase.rpc('rpc_get_membership_usage', {
        p_tenant_id: Number(tenantId),
      });
      if (error) throw error;
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.error) return null;
      // Map RPC field names to component field names
      return {
        included_hours_annual: parsed.included_hours_annual ?? 0,
        hours_used_ytd: parsed.hours_used_in_year ?? parsed.hours_used_ytd ?? 0,
        hours_remaining: parsed.hours_remaining ?? 0,
        percent_utilised: parsed.percent_utilised ?? 0,
        membership_year_start: parsed.membership_start_date ?? parsed.membership_year_start,
        membership_year_end: parsed.membership_end_date ?? parsed.membership_year_end,
        tier_name: parsed.tier_name,
        flags: parsed.flags,
      } as MembershipUsage;
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export interface ConsultantClient {
  tenant_id: number;
  name: string;
  tier_name: string;
  weekly_required: number;
  onboarding_multiplier: number;
  percent_utilised: number;
}

export function useConsultantClients(consultantUuid: string | null) {
  return useQuery({
    queryKey: ['consultant-clients', consultantUuid],
    queryFn: async (): Promise<ConsultantClient[]> => {
      if (!consultantUuid) return [];
      const { data, error } = await supabase.rpc('rpc_get_consultant_clients', {
        p_consultant_uuid: consultantUuid,
      });
      if (error) throw error;
      if (!data) return [];
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return (Array.isArray(parsed) ? parsed : []) as ConsultantClient[];
    },
    enabled: !!consultantUuid,
    staleTime: 30_000,
  });
}
