/**
 * useAuth Hook Tests
 * 
 * Tests for authentication context RBAC helper functions:
 * - isSuperAdmin
 * - hasTenantAccess
 * - hasTenantAdmin
 * - getTenantRole
 */
import { describe, it, expect } from 'vitest';
import { mockUsers, mockMemberships, testTenants } from '../fixtures/auth-test-data';

// Profile type that accepts any user role
interface UserProfile {
  user_uuid: string;
  email: string;
  first_name: string;
  last_name: string;
  unicorn_role: string;
  global_role: string | null;
  tenant_id: number | null;
  avatar_url: string | null;
}

// Membership type
interface TenantMembership {
  tenant_id: number;
  role: 'Admin' | 'General User';
  status: string;
}

// Extract the pure logic functions for testing (without React context)
// These mirror the logic in useAuth.tsx

function isSuperAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.global_role === 'SuperAdmin' || profile.unicorn_role === 'Super Admin';
}

function hasTenantAccess(
  profile: UserProfile | null,
  memberships: TenantMembership[],
  tenantId: number
): boolean {
  if (isSuperAdmin(profile)) return true;
  return memberships.some(m => m.tenant_id === tenantId && m.status === 'active');
}

function hasTenantAdmin(
  profile: UserProfile | null,
  memberships: TenantMembership[],
  tenantId: number
): boolean {
  if (isSuperAdmin(profile)) return true;
  return memberships.some(m => m.tenant_id === tenantId && m.role === 'Admin' && m.status === 'active');
}

function getTenantRole(
  profile: UserProfile | null,
  memberships: TenantMembership[],
  tenantId: number
): 'Admin' | 'General User' | null {
  if (isSuperAdmin(profile)) return 'Admin';
  const membership = memberships.find(m => m.tenant_id === tenantId && m.status === 'active');
  return membership?.role || null;
}

describe('useAuth RBAC Helpers', () => {
  describe('isSuperAdmin', () => {
    it('returns true for users with global_role SuperAdmin', () => {
      expect(isSuperAdmin(mockUsers.superAdmin)).toBe(true);
    });

    it('returns true for users with unicorn_role Super Admin', () => {
      const profile = { ...mockUsers.teamLeader, unicorn_role: 'Super Admin' as const };
      expect(isSuperAdmin(profile)).toBe(true);
    });

    it('returns false for Team Leader', () => {
      expect(isSuperAdmin(mockUsers.teamLeader)).toBe(false);
    });

    it('returns false for Team Member', () => {
      expect(isSuperAdmin(mockUsers.teamMember)).toBe(false);
    });

    it('returns false for Client Admin', () => {
      expect(isSuperAdmin(mockUsers.clientAdmin)).toBe(false);
    });

    it('returns false for Client User', () => {
      expect(isSuperAdmin(mockUsers.clientUser)).toBe(false);
    });

    it('returns false for null profile', () => {
      expect(isSuperAdmin(null)).toBe(false);
    });
  });

  describe('hasTenantAccess', () => {
    it('SuperAdmin has access to any tenant', () => {
      expect(hasTenantAccess(mockUsers.superAdmin, [], testTenants.clientA.id)).toBe(true);
      expect(hasTenantAccess(mockUsers.superAdmin, [], testTenants.clientB.id)).toBe(true);
    });

    it('Client Admin has access to their tenant', () => {
      expect(hasTenantAccess(
        mockUsers.clientAdmin,
        mockMemberships.clientAdminMemberships,
        testTenants.clientA.id
      )).toBe(true);
    });

    it('Client Admin does NOT have access to other tenants', () => {
      expect(hasTenantAccess(
        mockUsers.clientAdmin,
        mockMemberships.clientAdminMemberships,
        testTenants.clientB.id
      )).toBe(false);
    });

    it('Multi-tenant user has access to all their tenants', () => {
      expect(hasTenantAccess(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientA.id
      )).toBe(true);
      expect(hasTenantAccess(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientB.id
      )).toBe(true);
    });

    it('Inactive membership does NOT grant access', () => {
      expect(hasTenantAccess(
        mockUsers.clientAdmin,
        mockMemberships.inactiveMembership,
        testTenants.clientA.id
      )).toBe(false);
    });

    it('returns false for null profile without SuperAdmin status', () => {
      expect(hasTenantAccess(null, [], testTenants.clientA.id)).toBe(false);
    });
  });

  describe('hasTenantAdmin', () => {
    it('SuperAdmin has admin access to any tenant', () => {
      expect(hasTenantAdmin(mockUsers.superAdmin, [], testTenants.clientA.id)).toBe(true);
    });

    it('Client Admin has admin access to their tenant', () => {
      expect(hasTenantAdmin(
        mockUsers.clientAdmin,
        mockMemberships.clientAdminMemberships,
        testTenants.clientA.id
      )).toBe(true);
    });

    it('Client User (General User role) does NOT have admin access', () => {
      expect(hasTenantAdmin(
        mockUsers.clientUser,
        mockMemberships.clientUserMemberships,
        testTenants.clientA.id
      )).toBe(false);
    });

    it('Multi-tenant user has correct admin status per tenant', () => {
      // Admin in tenant 9999
      expect(hasTenantAdmin(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientA.id
      )).toBe(true);
      // General User in tenant 8888
      expect(hasTenantAdmin(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientB.id
      )).toBe(false);
    });
  });

  describe('getTenantRole', () => {
    it('SuperAdmin always returns Admin role', () => {
      expect(getTenantRole(mockUsers.superAdmin, [], testTenants.clientA.id)).toBe('Admin');
      expect(getTenantRole(mockUsers.superAdmin, [], 99999)).toBe('Admin');
    });

    it('returns correct role for tenant membership', () => {
      expect(getTenantRole(
        mockUsers.clientAdmin,
        mockMemberships.clientAdminMemberships,
        testTenants.clientA.id
      )).toBe('Admin');
      
      expect(getTenantRole(
        mockUsers.clientUser,
        mockMemberships.clientUserMemberships,
        testTenants.clientA.id
      )).toBe('General User');
    });

    it('returns null for tenant without membership', () => {
      expect(getTenantRole(
        mockUsers.clientAdmin,
        mockMemberships.clientAdminMemberships,
        testTenants.clientB.id
      )).toBe(null);
    });

    it('returns null for inactive membership', () => {
      expect(getTenantRole(
        mockUsers.clientAdmin,
        mockMemberships.inactiveMembership,
        testTenants.clientA.id
      )).toBe(null);
    });

    it('returns correct role in multi-tenant scenario', () => {
      expect(getTenantRole(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientA.id
      )).toBe('Admin');
      expect(getTenantRole(
        mockUsers.clientAdmin,
        mockMemberships.multiTenantMemberships,
        testTenants.clientB.id
      )).toBe('General User');
    });
  });
});
