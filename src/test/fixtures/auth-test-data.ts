/**
 * Authentication Test Data Fixtures
 * 
 * Mock data for authentication and authorization tests
 */

import type { User, Session } from '@supabase/supabase-js';

// Mock Users
export const mockUsers = {
  superAdmin: {
    user_uuid: 'super-admin-uuid-001',
    email: 'superadmin@vivacity.com.au',
    first_name: 'Super',
    last_name: 'Admin',
    unicorn_role: 'Super Admin' as const,
    global_role: 'SuperAdmin' as const,
    tenant_id: 6372,
    avatar_url: null,
  },
  teamLeader: {
    user_uuid: 'team-leader-uuid-002',
    email: 'teamlead@vivacity.com.au',
    first_name: 'Team',
    last_name: 'Leader',
    unicorn_role: 'Team Leader' as const,
    global_role: null,
    tenant_id: 6372,
    avatar_url: null,
  },
  teamMember: {
    user_uuid: 'team-member-uuid-003',
    email: 'teammember@vivacity.com.au',
    first_name: 'Team',
    last_name: 'Member',
    unicorn_role: 'Team Member' as const,
    global_role: null,
    tenant_id: 6372,
    avatar_url: null,
  },
  clientAdmin: {
    user_uuid: 'client-admin-uuid-101',
    email: 'admin@clientrto.com',
    first_name: 'Client',
    last_name: 'Admin',
    unicorn_role: 'Admin' as const,
    global_role: null,
    tenant_id: 9999,
    avatar_url: null,
  },
  clientUser: {
    user_uuid: 'client-user-uuid-102',
    email: 'user@clientrto.com',
    first_name: 'Client',
    last_name: 'User',
    unicorn_role: 'User' as const,
    global_role: null,
    tenant_id: 9999,
    avatar_url: null,
  },
  generalUser: {
    user_uuid: 'general-user-uuid-103',
    email: 'general@clientrto.com',
    first_name: 'General',
    last_name: 'User',
    unicorn_role: 'General User' as const,
    global_role: null,
    tenant_id: 9999,
    avatar_url: null,
  },
};

// Mock tenant memberships
export const mockMemberships = {
  superAdminMemberships: [
    { tenant_id: 6372, role: 'Admin' as const, status: 'active' },
    { tenant_id: 9999, role: 'Admin' as const, status: 'active' }, // SuperAdmin has access everywhere
  ],
  teamLeaderMemberships: [
    { tenant_id: 6372, role: 'Admin' as const, status: 'active' },
  ],
  clientAdminMemberships: [
    { tenant_id: 9999, role: 'Admin' as const, status: 'active' },
  ],
  clientUserMemberships: [
    { tenant_id: 9999, role: 'General User' as const, status: 'active' },
  ],
  multiTenantMemberships: [
    { tenant_id: 9999, role: 'Admin' as const, status: 'active' },
    { tenant_id: 8888, role: 'General User' as const, status: 'active' },
  ],
  inactiveMembership: [
    { tenant_id: 9999, role: 'Admin' as const, status: 'inactive' },
  ],
};

// Mock Supabase User object
export function createMockSupabaseUser(profile: typeof mockUsers.superAdmin): User {
  return {
    id: profile.user_uuid,
    email: profile.email,
    app_metadata: {},
    user_metadata: {
      first_name: profile.first_name,
      last_name: profile.last_name,
    },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    role: 'authenticated',
    updated_at: '2026-01-01T00:00:00Z',
  } as User;
}

// Mock Session
export function createMockSession(user: User): Session {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Date.now() / 1000 + 3600,
    user,
  } as Session;
}

// Test tenants
export const testTenants = {
  vivacity: {
    id: 6372,
    name: 'Vivacity Coaching & Consulting',
    is_system_tenant: true,
  },
  clientA: {
    id: 9999,
    name: 'Test Client RTO',
    is_system_tenant: false,
  },
  clientB: {
    id: 8888,
    name: 'Another Client RTO',
    is_system_tenant: false,
  },
};
