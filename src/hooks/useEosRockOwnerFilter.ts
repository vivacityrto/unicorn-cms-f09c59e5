import { useState } from 'react';

type RockOwnerOption = { user_uuid: string };

/**
 * Start on the signed-in user's Rocks once the staff directory is available,
 * while preserving any explicit filter choice (including "all").
 */
export function useEosRockOwnerFilter(
  profileUserUuid: string | undefined,
  users: readonly RockOwnerOption[] | undefined,
) {
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const isProfileInDirectory = Boolean(
    profileUserUuid && users?.some((user) => user.user_uuid === profileUserUuid),
  );
  const filter =
    selectedFilter ?? (isProfileInDirectory ? profileUserUuid! : 'all');

  return { filter, setFilter: setSelectedFilter };
}
