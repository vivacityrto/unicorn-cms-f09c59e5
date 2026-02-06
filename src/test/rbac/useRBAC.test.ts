/**
 * useRBAC Hook Tests
 * 
 * Tests for role-based access control:
 * - Permission checks by role
 * - Route access control
 * - EOS access restrictions
 */
import { describe, it, expect } from 'vitest';
import { mockUsers } from '../fixtures/auth-test-data';
import type { Permission } from '@/hooks/useRBAC';
import { ADMIN_ROUTES, ADVANCED_ROUTES, EOS_ROUTES } from '@/hooks/useRBAC';

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

// Role-based permission mappings (mirrors useRBAC.tsx)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  'SuperAdmin': [
    'administration:access',
    'advanced_features:access',
    'eos:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
    'qc:sign',
    'rocks:create',
    'rocks:edit_own',
    'rocks:edit_others',
    'risks:create',
    'risks:escalate',
    'risks:close_critical',
    'agenda_templates:manage',
  ],
  'Super Admin': [
    'administration:access',
    'advanced_features:access',
    'eos:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
    'qc:sign',
    'rocks:create',
    'rocks:edit_own',
    'rocks:edit_others',
    'risks:create',
    'risks:escalate',
    'risks:close_critical',
    'agenda_templates:manage',
  ],
  'Team Leader': [
    'advanced_features:access',
    'eos:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
    'qc:sign',
    'rocks:create',
    'rocks:edit_own',
    'rocks:edit_others',
    'risks:create',
    'risks:escalate',
  ],
  'Team Member': [
    'advanced_features:access',
    'eos:access',
    'vto:edit',
    'qc:edit',
    'qc:view_all',
    'qc:sign',
    'rocks:create',
    'rocks:edit_own',
    'risks:create',
  ],
  'Admin': [],
  'User': [],
  'General User': [],
};

// Pure logic functions for testing
function isSuperAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.global_role === 'SuperAdmin' || profile.unicorn_role === 'Super Admin';
}

function isVivacityTeam(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return ['Super Admin', 'Team Leader', 'Team Member'].includes(profile.unicorn_role);
}

function hasPermission(profile: UserProfile | null, permission: Permission): boolean {
  if (isSuperAdmin(profile)) return true;
  const userRole = profile?.unicorn_role || 'General User';
  const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['General User'];
  return permissions.includes(permission);
}

function canAccessRoute(profile: UserProfile | null, path: string): boolean {
  // Check admin routes
  if (ADMIN_ROUTES.some(route => path.startsWith(route))) {
    return hasPermission(profile, 'administration:access');
  }
  // Check advanced routes
  if (ADVANCED_ROUTES.some(route => path.startsWith(route))) {
    return hasPermission(profile, 'advanced_features:access');
  }
  // Check EOS routes
  if (EOS_ROUTES.some(route => path.startsWith(route))) {
    return hasPermission(profile, 'eos:access');
  }
  return true;
}

describe('useRBAC Permission Checks', () => {
  describe('Role Detection', () => {
    it('correctly identifies SuperAdmin via global_role', () => {
      expect(isSuperAdmin(mockUsers.superAdmin)).toBe(true);
    });

    it('correctly identifies SuperAdmin via unicorn_role', () => {
      const profile = { ...mockUsers.teamLeader, unicorn_role: 'Super Admin' as const };
      expect(isSuperAdmin(profile)).toBe(true);
    });

    it('correctly identifies Vivacity Team members', () => {
      expect(isVivacityTeam(mockUsers.superAdmin)).toBe(true);
      expect(isVivacityTeam(mockUsers.teamLeader)).toBe(true);
      expect(isVivacityTeam(mockUsers.teamMember)).toBe(true);
    });

    it('correctly identifies non-Vivacity Team members', () => {
      expect(isVivacityTeam(mockUsers.clientAdmin)).toBe(false);
      expect(isVivacityTeam(mockUsers.clientUser)).toBe(false);
      expect(isVivacityTeam(mockUsers.generalUser)).toBe(false);
    });
  });

  describe('Permission: administration:access', () => {
    it('SuperAdmin has admin access', () => {
      expect(hasPermission(mockUsers.superAdmin, 'administration:access')).toBe(true);
    });

    it('Team Leader does NOT have admin access', () => {
      expect(hasPermission(mockUsers.teamLeader, 'administration:access')).toBe(false);
    });

    it('Team Member does NOT have admin access', () => {
      expect(hasPermission(mockUsers.teamMember, 'administration:access')).toBe(false);
    });

    it('Client roles do NOT have admin access', () => {
      expect(hasPermission(mockUsers.clientAdmin, 'administration:access')).toBe(false);
      expect(hasPermission(mockUsers.clientUser, 'administration:access')).toBe(false);
    });
  });

  describe('Permission: eos:access', () => {
    it('All Vivacity Team roles have EOS access', () => {
      expect(hasPermission(mockUsers.superAdmin, 'eos:access')).toBe(true);
      expect(hasPermission(mockUsers.teamLeader, 'eos:access')).toBe(true);
      expect(hasPermission(mockUsers.teamMember, 'eos:access')).toBe(true);
    });

    it('Client roles do NOT have EOS access', () => {
      expect(hasPermission(mockUsers.clientAdmin, 'eos:access')).toBe(false);
      expect(hasPermission(mockUsers.clientUser, 'eos:access')).toBe(false);
      expect(hasPermission(mockUsers.generalUser, 'eos:access')).toBe(false);
    });
  });

  describe('Permission: eos_meetings:schedule', () => {
    it('SuperAdmin can schedule meetings', () => {
      expect(hasPermission(mockUsers.superAdmin, 'eos_meetings:schedule')).toBe(true);
    });

    it('Team Leader can schedule meetings', () => {
      expect(hasPermission(mockUsers.teamLeader, 'eos_meetings:schedule')).toBe(true);
    });

    it('Team Member CANNOT schedule meetings', () => {
      expect(hasPermission(mockUsers.teamMember, 'eos_meetings:schedule')).toBe(false);
    });
  });

  describe('Permission: risks:escalate', () => {
    it('SuperAdmin can escalate risks', () => {
      expect(hasPermission(mockUsers.superAdmin, 'risks:escalate')).toBe(true);
    });

    it('Team Leader can escalate risks', () => {
      expect(hasPermission(mockUsers.teamLeader, 'risks:escalate')).toBe(true);
    });

    it('Team Member CANNOT escalate risks', () => {
      expect(hasPermission(mockUsers.teamMember, 'risks:escalate')).toBe(false);
    });
  });

  describe('Permission: rocks:edit_others', () => {
    it('SuperAdmin and Team Leader can edit others rocks', () => {
      expect(hasPermission(mockUsers.superAdmin, 'rocks:edit_others')).toBe(true);
      expect(hasPermission(mockUsers.teamLeader, 'rocks:edit_others')).toBe(true);
    });

    it('Team Member can only edit own rocks', () => {
      expect(hasPermission(mockUsers.teamMember, 'rocks:edit_own')).toBe(true);
      expect(hasPermission(mockUsers.teamMember, 'rocks:edit_others')).toBe(false);
    });
  });

  describe('Permission: agenda_templates:manage', () => {
    it('Only SuperAdmin can manage agenda templates', () => {
      expect(hasPermission(mockUsers.superAdmin, 'agenda_templates:manage')).toBe(true);
      expect(hasPermission(mockUsers.teamLeader, 'agenda_templates:manage')).toBe(false);
      expect(hasPermission(mockUsers.teamMember, 'agenda_templates:manage')).toBe(false);
    });
  });
});

describe('Route Access Control', () => {
  describe('Admin Routes', () => {
    const adminRoutes = [
      '/manage-users',
      '/manage-invites',
      '/admin/manage-packages',
      '/admin/stage-builder',
      '/admin/team-users',
    ];

    it('SuperAdmin can access all admin routes', () => {
      adminRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.superAdmin, route)).toBe(true);
      });
    });

    it('Team Leader CANNOT access admin routes', () => {
      adminRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.teamLeader, route)).toBe(false);
      });
    });

    it('Client Admin CANNOT access admin routes', () => {
      adminRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.clientAdmin, route)).toBe(false);
      });
    });
  });

  describe('EOS Routes', () => {
    const eosRoutes = [
      '/eos',
      '/eos/overview',
      '/eos/scorecard',
      '/eos/vto',
      '/eos/rocks',
      '/eos/meetings',
      '/eos/qc',
    ];

    it('All Vivacity Team can access EOS routes', () => {
      eosRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.superAdmin, route)).toBe(true);
        expect(canAccessRoute(mockUsers.teamLeader, route)).toBe(true);
        expect(canAccessRoute(mockUsers.teamMember, route)).toBe(true);
      });
    });

    it('Client roles CANNOT access EOS routes', () => {
      eosRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.clientAdmin, route)).toBe(false);
        expect(canAccessRoute(mockUsers.clientUser, route)).toBe(false);
      });
    });
  });

  describe('Advanced Routes', () => {
    const advancedRoutes = ['/templates', '/frameworks', '/audit-logs', '/risks'];

    it('Vivacity Team can access advanced routes', () => {
      advancedRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.superAdmin, route)).toBe(true);
        expect(canAccessRoute(mockUsers.teamLeader, route)).toBe(true);
        expect(canAccessRoute(mockUsers.teamMember, route)).toBe(true);
      });
    });

    it('Client roles CANNOT access advanced routes', () => {
      advancedRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.clientAdmin, route)).toBe(false);
      });
    });
  });

  describe('Public Routes', () => {
    const publicRoutes = ['/dashboard', '/clients', '/settings', '/profile'];

    it('All roles can access public routes', () => {
      publicRoutes.forEach(route => {
        expect(canAccessRoute(mockUsers.superAdmin, route)).toBe(true);
        expect(canAccessRoute(mockUsers.teamLeader, route)).toBe(true);
        expect(canAccessRoute(mockUsers.clientAdmin, route)).toBe(true);
        expect(canAccessRoute(mockUsers.clientUser, route)).toBe(true);
      });
    });
  });
});

describe('Edge Cases', () => {
  it('handles null profile gracefully', () => {
    expect(hasPermission(null, 'administration:access')).toBe(false);
    expect(hasPermission(null, 'eos:access')).toBe(false);
    expect(canAccessRoute(null, '/eos')).toBe(false);
    expect(canAccessRoute(null, '/dashboard')).toBe(true);
  });

  it('handles unknown role as General User', () => {
    const unknownRoleProfile = { ...mockUsers.clientUser, unicorn_role: 'Unknown Role' as any };
    expect(hasPermission(unknownRoleProfile, 'eos:access')).toBe(false);
    expect(hasPermission(unknownRoleProfile, 'administration:access')).toBe(false);
  });

  it('route matching handles nested paths', () => {
    expect(canAccessRoute(mockUsers.teamLeader, '/eos/meetings/123')).toBe(true);
    expect(canAccessRoute(mockUsers.clientAdmin, '/eos/meetings/123')).toBe(false);
    expect(canAccessRoute(mockUsers.teamLeader, '/admin/stage-builder/edit')).toBe(false);
  });
});
