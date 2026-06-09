import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PERM_LEVELS: Record<string, number> = {
  full: 3,
  limited: 2,
  owner_only: 1,
  none: 0,
};

type MinLevel = 'full' | 'limited' | 'owner_only';

/**
 * Returns true if the current user has at least `minLevel` permission for the
 * given feature, based on the role_permissions matrix combined with their
 * unicorn_role and any additional roles in user_roles.
 *
 * Super Admin always returns true.
 */
export function usePermission(
  featureKey: string,
  minLevel: MinLevel = 'limited',
): boolean {
  const { user, profile, isSuperAdmin } = useAuth();

  const { data: permRows } = useQuery({
    queryKey: ['role_permissions', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('feature_key,role,level');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: userRoleRows } = useQuery({
    queryKey: ['user_roles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_uuid', user!.id);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!user) return false;
  if (isSuperAdmin()) return true;

  const rows = permRows ?? [];

  // Collect all roles for this user
  const allRoles = new Set<string>();
  if (profile?.unicorn_role) allRoles.add(profile.unicorn_role);
  (userRoleRows ?? []).forEach((r: { role: string }) => allRoles.add(r.role));

  const minOrdinal = PERM_LEVELS[minLevel] ?? 0;

  for (const role of allRoles) {
    const row = rows.find(
      (r: { feature_key: string; role: string; level: string }) =>
        r.feature_key === featureKey && r.role === role,
    );
    const level = row ? PERM_LEVELS[row.level] ?? 0 : 0;
    if (level >= minOrdinal) return true;
  }
  return false;
}
