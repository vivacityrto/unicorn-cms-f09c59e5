import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

/**
 * Tenant Team Users Hook
 * 
 * This hook fetches users who belong to the current tenant's team.
 * For Vivacity tenant (6372), returns Super Admin, Team Leader, Team Member.
 * For client tenants, returns Admin and User roles within that tenant.
 * 
 * Used for Process Owner and Reviewer dropdowns where:
 * - Only tenant team members can own or review processes
 * - Clients cannot be assigned as owners or reviewers
 */

export interface TenantTeamUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  unicorn_role: string | null;
  job_title: string | null;
}

export const VIVACITY_TENANT_ID = 6372;

export function useTenantTeamUsers() {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ['tenant-team-users', tenantId],
    queryFn: async (): Promise<TenantTeamUser[]> => {
      // For Vivacity tenant or SuperAdmins, return Vivacity team users
      const isVivacityTenant = tenantId === VIVACITY_TENANT_ID || isSuper;
      
      if (isVivacityTenant) {
        // Return Vivacity internal team only
        const { data, error } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title')
          .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
          .eq('archived', false)
          .eq('disabled', false)
          .order('first_name', { ascending: true });

        if (error) throw error;
        return (data || []) as TenantTeamUser[];
      }

      // For client tenants, return users in that tenant with Admin/User roles
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title')
        .eq('tenant_id', tenantId)
        .in('unicorn_role', ['Admin', 'User'])
        .eq('archived', false)
        .eq('disabled', false)
        .order('first_name', { ascending: true });

      if (error) throw error;
      return (data || []) as TenantTeamUser[];
    },
    enabled: !!tenantId || isSuper,
    staleTime: QUERY_STALE_TIMES.PROFILE,
  });
}

/**
 * Helper to get display name for a user
 */
export function getUserDisplayName(user: TenantTeamUser | null | undefined): string {
  if (!user) return 'Unassigned';
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  }
  return user.email;
}

/**
 * Helper to check if a user ID is a valid tenant team member
 */
export function isValidTenantTeamUser(userId: string | null | undefined, teamUsers: TenantTeamUser[]): boolean {
  if (!userId) return false;
  return teamUsers.some(u => u.user_uuid === userId);
}
