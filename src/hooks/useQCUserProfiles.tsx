import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

interface QCUserProfile {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/**
 * Batch-fetch user profiles for a list of user UUIDs (reviewees + managers).
 * Returns a map of user_uuid -> { fullName, initials, avatarUrl }.
 */
export function useQCUserProfiles(userIds: string[]) {
  const uniqueIds = useMemo(() => [...new Set(userIds.filter(Boolean))], [userIds]);

  const { data: profiles } = useQuery({
    queryKey: ['qc-user-profiles', uniqueIds],
    queryFn: async () => {
      if (uniqueIds.length === 0) return [];
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, avatar_url')
        .in('user_uuid', uniqueIds);
      if (error) throw error;
      return (data || []) as QCUserProfile[];
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const userMap = useMemo(() => {
    const map = new Map<string, { fullName: string; initials: string; avatarUrl: string | null }>();
    (profiles || []).forEach((p) => {
      const first = p.first_name || '';
      const last = p.last_name || '';
      const fullName = [first, last].filter(Boolean).join(' ') || 'Unknown User';
      const initials = [first, last].filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
      map.set(p.user_uuid, { fullName, initials, avatarUrl: p.avatar_url });
    });
    return map;
  }, [profiles]);

  const getUser = (userId: string | null | undefined) => {
    if (!userId) return { fullName: 'Unassigned', initials: '?', avatarUrl: null };
    return userMap.get(userId) || { fullName: 'Unknown User', initials: '?', avatarUrl: null };
  };

  return { userMap, getUser };
}
