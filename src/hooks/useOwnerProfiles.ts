/**
 * useOwnerProfiles – Unicorn 2.0
 *
 * Batch-resolves user_uuid → first_name + avatar_url for display in tables.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OwnerProfile {
  user_uuid: string;
  first_name: string | null;
  avatar_url: string | null;
}

export function useOwnerProfiles(uuids: string[]) {
  const unique = Array.from(new Set(uuids.filter(Boolean)));

  return useQuery({
    queryKey: ['owner-profiles', unique.sort().join(',')],
    queryFn: async (): Promise<Record<string, OwnerProfile>> => {
      if (unique.length === 0) return {};
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, avatar_url')
        .in('user_uuid', unique);
      if (error) throw error;
      const map: Record<string, OwnerProfile> = {};
      for (const u of data ?? []) {
        map[u.user_uuid] = u as OwnerProfile;
      }
      return map;
    },
    enabled: unique.length > 0,
    staleTime: 60_000,
  });
}
