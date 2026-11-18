import { useMemo } from 'react';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

/** user id to "First Last", for showing who owns a measure. Unknown ids simply have no name. */
export function useOwnerNames(): Readonly<Record<string, string>> {
  const { data } = useVivacityTeamUsers();
  return useMemo(() => {
    const names: Record<string, string> = {};
    for (const u of data ?? []) {
      const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
      if (name) names[u.user_uuid] = name;
    }
    return names;
  }, [data]);
}
