import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  login_date: string;
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
  login_count: number;
}

export function useLoginHistory(tenantId: number | null) {
  // Fetch tenant users with their last sign-in and login counts
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

      const { data: users, error: uError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, last_sign_in_at')
        .in('user_uuid', userIds);

      if (uError) throw uError;

      // Get login counts from user_activity
      const { data: activities, error: aError } = await supabase
        .from('user_activity')
        .select('user_id, login_date')
        .in('user_id', userIds)
        .order('login_date', { ascending: false });

      if (aError) throw aError;

      const loginCounts = new Map<string, number>();
      activities?.forEach(a => {
        loginCounts.set(a.user_id, (loginCounts.get(a.user_id) || 0) + 1);
      });

      const roleMap = new Map(tenantUsers.map(tu => [tu.user_id, tu.role]));

      return (users || []).map(u => ({
        user_id: u.user_uuid,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        email: u.email || '',
        role: roleMap.get(u.user_uuid) || 'unknown',
        last_sign_in_at: u.last_sign_in_at,
        login_count: loginCounts.get(u.user_uuid) || 0,
      }));
    },
    enabled: !!tenantId,
  });

  // Fetch detailed login activity entries
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

      const { data: activities, error } = await supabase
        .from('user_activity')
        .select('id, user_id, login_date, docs_downloaded, messages_sent, tasks_created')
        .in('user_id', userIds)
        .order('login_date', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Enrich with user names
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .in('user_uuid', userIds);

      const userMap = new Map(
        (users || []).map(u => [u.user_uuid, u])
      );

      return (activities || []).map(a => {
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
