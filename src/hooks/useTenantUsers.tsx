import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TenantUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email?: string;
  avatar_url?: string | null;
}

export const useTenantUsers = () => {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();

  const { data: users, isLoading } = useQuery({
    queryKey: ['tenant-users', isSuper ? 'all' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url');
      
      // SuperAdmins see all; others filter by tenant
      if (!isSuper && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TenantUser[];
    },
    enabled: isSuper || !!profile?.tenant_id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Helper to get user display name by UUID
  const getUserName = (userId?: string | null): string => {
    if (!userId || !users) return 'Unassigned';
    const user = users.find(u => u.user_uuid === userId);
    if (!user) return 'Unknown';
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email || 'Unknown';
  };

  // Helper to get user by UUID
  const getUser = (userId?: string | null): TenantUser | undefined => {
    if (!userId || !users) return undefined;
    return users.find(u => u.user_uuid === userId);
  };

  return {
    users,
    isLoading,
    getUserName,
    getUser,
  };
};
