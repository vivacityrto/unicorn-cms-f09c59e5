/**
 * Pure authorization predicates shared by the auth context and focused tests.
 * These helpers intentionally consume only the profile/membership fields they
 * need; session loading and Supabase I/O remain owned by useAuth.
 */
export type AuthProfile = {
  global_role: string | null;
  unicorn_role: string | null;
};

export type TenantMembership = {
  tenant_id: number;
  role: 'Admin' | 'General User';
  status: string;
};

export type TenantRole = TenantMembership['role'] | null;

export function isSuperAdmin(profile: AuthProfile | null): boolean {
  return profile?.global_role === 'SuperAdmin' || profile?.unicorn_role === 'Super Admin';
}

export function hasTenantAccess(
  profile: AuthProfile | null,
  memberships: TenantMembership[],
  tenantId: number,
): boolean {
  if (isSuperAdmin(profile)) return true;
  return memberships.some((membership) => membership.tenant_id === tenantId && membership.status === 'active');
}

export function hasTenantAdmin(
  profile: AuthProfile | null,
  memberships: TenantMembership[],
  tenantId: number,
): boolean {
  if (isSuperAdmin(profile)) return true;
  return memberships.some(
    (membership) => membership.tenant_id === tenantId && membership.role === 'Admin' && membership.status === 'active',
  );
}

export function getTenantRole(
  profile: AuthProfile | null,
  memberships: TenantMembership[],
  tenantId: number,
): TenantRole {
  if (isSuperAdmin(profile)) return 'Admin';
  return memberships.find((membership) => membership.tenant_id === tenantId && membership.status === 'active')?.role ?? null;
}
