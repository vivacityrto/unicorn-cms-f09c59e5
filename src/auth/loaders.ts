import { supabase } from '@/integrations/supabase/client';
import type { TenantMembership } from '@/auth/access';
import type { UserProfile } from '@/auth/types';

const USER_PROFILE_COLUMNS = 'user_uuid, email, first_name, last_name, unicorn_role, global_role, superadmin_level, tenant_id, avatar_url, job_title, is_vivacity_internal, is_team, kpi_role';

/**
 * Read the profile fields needed by AuthProvider. State/error presentation
 * remains in useAuth; this module owns only the Supabase query boundary.
 */
export async function loadUserProfile(userId: string): Promise<{ data: UserProfile | null; error: unknown | null }> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_PROFILE_COLUMNS)
    .eq('user_uuid', userId)
    .maybeSingle();

  return { data: data as UserProfile | null, error };
}

/** Read active tenant memberships used by the AuthProvider RBAC helpers. */
export async function loadTenantMemberships(
  userId: string,
): Promise<{ data: TenantMembership[]; error: unknown | null }> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, role, status')
    .eq('user_id', userId)
    .eq('status', 'active');

  return { data: (data || []) as TenantMembership[], error };
}
