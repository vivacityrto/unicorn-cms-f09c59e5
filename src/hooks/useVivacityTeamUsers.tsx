import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

/**
 * Vivacity Team Users Hook
 *
 * This hook fetches ONLY Vivacity Team users (Super Admin, Team Leader, Team Member).
 * Use this for ALL EOS-related dropdowns to ensure clients are never shown.
 *
 * EOS is Vivacity-internal only. Clients do not use EOS features.
 *
 * Backed by the `get_vivacity_team_directory_staff` SECURITY DEFINER RPC.
 * For non-staff callers the RPC returns 0 rows (no email/PII leakage).
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

/**
 * Public-safe directory entry shape (no email, no job_title).
 * Returned by `useVivacityTeamDirectory` for any-authenticated-user contexts.
 */
export interface VivacityTeamDirectoryEntry {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export const VIVACITY_TENANT_ID = 6372;

export function useVivacityTeamUsers() {
  return useQuery({
    queryKey: ['vivacity-team-users'],
    queryFn: async (): Promise<VivacityTeamUser[]> => {
      const { data, error } = await supabase.rpc('get_vivacity_team_directory_staff');

      if (error) throw error;
      return (data || []) as VivacityTeamUser[];
    },
    staleTime: QUERY_STALE_TIMES.PROFILE,
  });
}

/**
 * Public Vivacity team directory hook.
 * Returns only safe display fields (no email, no job_title).
 * Safe to use in any client-visible context.
 */
export function useVivacityTeamDirectory() {
  return useQuery({
    queryKey: ['vivacity-team-directory'],
    queryFn: async (): Promise<VivacityTeamDirectoryEntry[]> => {
      const { data, error } = await supabase.rpc('get_vivacity_team_directory');

      if (error) throw error;
      return (data || []) as VivacityTeamDirectoryEntry[];
    },
    staleTime: QUERY_STALE_TIMES.PROFILE,
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
    staleTime: QUERY_STALE_TIMES.STATIC,
  });
}
