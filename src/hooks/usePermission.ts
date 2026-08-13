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

interface PermissionResult {
  granted: boolean;
  /** True while the role_permissions/user_roles queries are still resolving.
   *  `granted` defaults to false during this window, so hard gates (e.g. a
   *  page-level redirect) should wait on this rather than treating it as a
   *  denial - Super Admin never hits this since it short-circuits instantly. */
  isLoading: boolean;
}

/**
 * Returns whether the current user has at least `minLevel` permission for the
 * given feature, based on the role_permissions matrix combined with their
 * unicorn_role and any additional roles in user_roles, plus whether that
 * determination is still loading.
 *
 * Super Admin always returns granted: true, isLoading: false.
 */
export function usePermissionDetailed(
  featureKey: string,
  minLevel: MinLevel = 'limited',
): PermissionResult {
  const { user, profile, isSuperAdmin } = useAuth();

  const { data: permRows, isLoading: permLoading } = useQuery({
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

  const { data: userRoleRows, isLoading: rolesLoading } = useQuery({
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

  if (!user) return { granted: false, isLoading: false };
  if (isSuperAdmin()) return { granted: true, isLoading: false };

  const rows = permRows ?? [];

  // Collect all roles for this user
  const allRoles = new Set<string>();
  if (profile?.unicorn_role) allRoles.add(profile.unicorn_role);
  (userRoleRows ?? []).forEach((r: { role: string }) => allRoles.add(r.role));

  const minOrdinal = PERM_LEVELS[minLevel] ?? 0;

  let granted = false;
  for (const role of allRoles) {
    const row = rows.find(
      (r: { feature_key: string; role: string; level: string }) =>
        r.feature_key === featureKey && r.role === role,
    );
    const level = row ? PERM_LEVELS[row.level] ?? 0 : 0;
    if (level >= minOrdinal) {
      granted = true;
      break;
    }
  }

  return { granted, isLoading: permLoading || rolesLoading };
}

/**
 * Convenience wrapper around {@link usePermissionDetailed} for callers that
 * only need the boolean (e.g. disabling/hiding a single action) and are fine
 * with it defaulting to false while still loading.
 */
export function usePermission(
  featureKey: string,
  minLevel: MinLevel = 'limited',
): boolean {
  return usePermissionDetailed(featureKey, minLevel).granted;
}
