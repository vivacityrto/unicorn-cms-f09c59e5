import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  login_date: string;
  logout_date: string | null;
  session_id: string | null;
  tenant_id: number | null;
  docs_downloaded: number | null;
  messages_sent: number | null;
  tasks_created: number | null;
  first_name: string;
  last_name: string;
  email: string;
}

export interface TenantUserLogin {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  last_sign_in_at: string | null;
  legacy_last_sign_in_at: string | null;
  login_count: number;
}

export function useLoginHistory(tenantId: number | null) {
  const usersQuery = useQuery({
    queryKey: ['login-history', 'users', tenantId],
    queryFn: async (): Promise<TenantUserLogin[]> => {
      if (!tenantId) return [];

      const { data: tenantUsers, error: tuError } = await supabase
        .from('tenant_users')
        .select('user_id, role')
        .eq('tenant_id', tenantId);

      if (tuError) throw tuError;
      if (!tenantUsers?.length) return [];

      const userIds = tenantUsers.map(tu => tu.user_id);

      // Fetch users, activity counts, and legacy snapshots in parallel
      const [usersResult, activitiesResult, legacyResult] = await Promise.all([
        supabase
          .from('users')
          .select('user_uuid, first_name, last_name, email, last_sign_in_at')
          .in('user_uuid', userIds),
        supabase
          .from('user_activity')
          .select('user_id')
          .in('user_id', userIds),
        supabase
          .from('legacy_login_snapshot')
          .select('user_id, last_sign_in_at')
          .in('user_id', userIds),
      ]);

      if (usersResult.error) throw usersResult.error;

      const loginCounts = new Map<string, number>();
      (activitiesResult.data || []).forEach(a => {
        loginCounts.set(a.user_id, (loginCounts.get(a.user_id) || 0) + 1);
      });

      const legacyMap = new Map(
        (legacyResult.data || []).map(l => [l.user_id, l.last_sign_in_at])
      );

      const roleMap = new Map(tenantUsers.map(tu => [tu.user_id, tu.role]));

      return (usersResult.data || []).map(u => ({
        user_id: u.user_uuid,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        email: u.email || '',
        role: roleMap.get(u.user_uuid) || 'unknown',
        last_sign_in_at: u.last_sign_in_at,
        legacy_last_sign_in_at: legacyMap.get(u.user_uuid) || null,
        login_count: loginCounts.get(u.user_uuid) || 0,
      }));
    },
    enabled: !!tenantId,
  });

  const activityQuery = useQuery({
    queryKey: ['login-history', 'activity', tenantId],
    queryFn: async (): Promise<LoginHistoryEntry[]> => {
      if (!tenantId) return [];

      const { data: tenantUsers, error: tuError } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId);

      if (tuError) throw tuError;
      if (!tenantUsers?.length) return [];

      const userIds = tenantUsers.map(tu => tu.user_id);

      const [activitiesResult, usersResult] = await Promise.all([
        supabase
          .from('user_activity')
          .select('id, user_id, login_date, logout_date, session_id, tenant_id, docs_downloaded, messages_sent, tasks_created')
          .in('user_id', userIds)
          .order('login_date', { ascending: false })
          .limit(200),
        supabase
          .from('users')
          .select('user_uuid, first_name, last_name, email')
          .in('user_uuid', userIds),
      ]);

      if (activitiesResult.error) throw activitiesResult.error;

      const userMap = new Map(
        (usersResult.data || []).map(u => [u.user_uuid, u])
      );

      return (activitiesResult.data || []).map(a => {
        const user = userMap.get(a.user_id);
        return {
          ...a,
          first_name: user?.first_name || '',
          last_name: user?.last_name || '',
          email: user?.email || '',
        };
      });
    },
    enabled: !!tenantId,
  });

  return {
    users: usersQuery.data || [],
    activities: activityQuery.data || [],
    loading: usersQuery.isLoading || activityQuery.isLoading,
  };
}
