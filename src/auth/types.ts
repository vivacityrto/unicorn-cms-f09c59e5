import type { Session, User } from '@supabase/supabase-js';

/**
 * Profile fields consumed by the authentication and authorization boundary.
 * Keep this contract narrower than the generated users row so consumers do
 * not couple to unrelated profile columns.
 */
export interface UserProfile {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member'
    | 'Integrator' | 'BGT' | 'CSC' | 'CET'
    | 'Admin' | 'User' | 'Academy User';
  global_role: 'SuperAdmin' | null;
  superadmin_level: 'Administrator' | 'Team Leader' | 'General' | 'Assistant' | null;
  tenant_id: number | null;
  avatar_url: string | null;
  job_title: string | null;
  is_vivacity_internal: boolean | null;
  is_team: boolean | null;
  kpi_role: string | null;
}

/** The profile fields required by pure authorization predicates. */
export type AuthProfile = Pick<UserProfile, 'global_role' | 'unicorn_role'>;

/** Active tenant membership fields loaded into the auth boundary. */
export type TenantMembership = {
  tenant_id: number;
  role: 'Admin' | 'General User';
  status: string;
};

/** Public value contract exposed by the session/profile context. */
export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  memberships: TenantMembership[];
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isSuperAdmin: () => boolean;
  hasTenantAccess: (tenantId: number) => boolean;
  hasTenantAdmin: (tenantId: number) => boolean;
  getTenantRole: (tenantId: number) => 'Admin' | 'General User' | null;
}
