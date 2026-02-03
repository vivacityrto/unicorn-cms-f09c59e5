import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vivacity Team Users Hook
 * 
 * This hook fetches ONLY Vivacity Team users (Super Admin, Team Leader, Team Member).
 * Use this for ALL EOS-related dropdowns to ensure clients are never shown.
 * 
 * EOS is Vivacity-internal only. Clients do not use EOS features.
 */

export interface VivacityTeamUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  unicorn_role: string | null;
  job_title: string | null;
}

export const VIVACITY_TENANT_ID = 6372;

export function useVivacityTeamUsers() {
  return useQuery({
    queryKey: ['vivacity-team-users'],
    queryFn: async (): Promise<VivacityTeamUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title')
        .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
        .eq('archived', false)
        .order('first_name', { ascending: true });

      if (error) throw error;
      return (data || []) as VivacityTeamUser[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get the system tenant ID (Vivacity Coaching & Consulting)
 * This is used for all EOS-related data that belongs to the internal tenant.
 */
export function useSystemTenantId() {
  return useQuery({
    queryKey: ['system-tenant-id'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .rpc('get_system_tenant_id');

      if (error) throw error;
      return data as number;
    },
    staleTime: Infinity, // Never changes
  });
}
