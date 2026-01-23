import { useAuth } from './useAuth';

// RBAC Permissions Configuration
export type Permission = 
  | 'administration:access'
  | 'advanced_features:access'
  | 'vto:edit'
  | 'eos_meetings:schedule'
  | 'eos_meetings:edit'
  | 'qc:schedule'
  | 'qc:edit'
  | 'qc:view_all';

// Role-based permission mappings
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // SuperAdmin has all permissions including administration
  'SuperAdmin': [
    'administration:access',
    'advanced_features:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
  ],
  // Super Admin (alternate spelling used in DB)
  'Super Admin': [
    'administration:access',
    'advanced_features:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
  ],
  // Team Leader - Vivacity staff, sees everything EXCEPT administration
  'Team Leader': [
    'advanced_features:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
  ],
  // Team Member - Vivacity staff, sees everything EXCEPT administration
  'Team Member': [
    'advanced_features:access',
    'vto:edit',
    'eos_meetings:schedule',
    'eos_meetings:edit',
    'qc:schedule',
    'qc:edit',
    'qc:view_all',
  ],
  // General User has limited permissions (read-only for most EOS features)
  'General User': [
    // No special permissions - can only view
  ],
};

// Administration routes that require SuperAdmin
export const ADMIN_ROUTES = [
  '/manage-users',
  '/manage-invites',
  '/audits',
  '/admin/manage-packages',
  '/admin/package-builder',
  '/admin/email-templates',
  '/admin/user-audit',
  '/admin/stages',
  '/admin/stage-builder',
  '/admin/stage-analytics',
  '/admin/team-users',
  '/admin/tenant-users',
];

// Advanced Features routes that require SuperAdmin
export const ADVANCED_ROUTES = [
  '/templates',
  '/frameworks',
  '/audit-logs',
  '/flags',
  '/risks',
  '/health',
  '/tools',
];

/**
 * Hook for Role-Based Access Control
 * Provides permission checking functions based on user's role
 * 
 * Detection logic:
 * - is_super_admin: profile.global_role === 'SuperAdmin' OR profile.unicorn_role === 'Super Admin'
 * - is_vivacity_team: unicorn_role is 'Super Admin', 'Team Leader', or 'Team Member'
 * 
 * ACCEPTANCE TESTS:
 * 1. SuperAdmin sees ADMINISTRATION section
 * 2. Vivacity Team (Team Leader/Team Member) sees everything EXCEPT ADMINISTRATION
 * 3. Tenant users (Admin/User) unchanged - see their limited menus
 * 4. No infinite spinner after login - profile loading handled gracefully
 */
export const useRBAC = () => {
  const { profile, isSuperAdmin } = useAuth();

  // Computed flags for role detection
  const is_super_admin = isSuperAdmin() || profile?.unicorn_role === 'Super Admin';
  
  // Vivacity Team = internal staff (Super Admin, Team Leader, Team Member)
  const is_vivacity_team = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development' && profile) {
    console.debug('[useRBAC] Role detection:', {
      unicorn_role: profile?.unicorn_role,
      global_role: profile?.global_role,
      is_super_admin,
      is_vivacity_team,
    });
  }

  /**
   * Check if current user has a specific permission
   */
  const hasPermission = (permission: Permission): boolean => {
    // SuperAdmin always has all permissions
    if (is_super_admin) return true;

    // Use unicorn_role for permission lookup (handles Team Leader, Team Member)
    const userRole = profile?.unicorn_role || 'General User';
    const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['General User'];
    
    return permissions.includes(permission);
  };

  /**
   * Check if current user can access administration features
   */
  const canAccessAdmin = (): boolean => {
    return hasPermission('administration:access');
  };

  /**
   * Check if current user can access advanced features
   */
  const canAccessAdvanced = (): boolean => {
    return hasPermission('advanced_features:access');
  };

  /**
   * Check if current user can edit V/TO
   */
  const canEditVTO = (): boolean => {
    return hasPermission('vto:edit');
  };

  /**
   * Check if current user can schedule EOS meetings
   */
  const canScheduleMeetings = (): boolean => {
    return hasPermission('eos_meetings:schedule');
  };

  /**
   * Check if current user can edit EOS meetings
   */
  const canEditMeetings = (): boolean => {
    return hasPermission('eos_meetings:edit');
  };

  /**
   * Check if current user can schedule Quarterly Conversations
   */
  const canScheduleQC = (): boolean => {
    return hasPermission('qc:schedule');
  };

  /**
   * Check if current user can edit Quarterly Conversations
   */
  const canEditQC = (): boolean => {
    return hasPermission('qc:edit');
  };

  /**
   * Check if current user can view all Quarterly Conversations
   * SuperAdmin can view all; General User can only view their own
   */
  const canViewAllQC = (): boolean => {
    return hasPermission('qc:view_all');
  };

  /**
   * Check if a route is protected and user has access
   */
  const canAccessRoute = (path: string): boolean => {
    // Check admin routes
    if (ADMIN_ROUTES.some(route => path.startsWith(route))) {
      return canAccessAdmin();
    }
    
    // Check advanced routes
    if (ADVANCED_ROUTES.some(route => path.startsWith(route))) {
      return canAccessAdvanced();
    }
    
    // All other routes are accessible
    return true;
  };

  return {
    hasPermission,
    canAccessAdmin,
    canAccessAdvanced,
    canEditVTO,
    canScheduleMeetings,
    canEditMeetings,
    canScheduleQC,
    canEditQC,
    canViewAllQC,
    canAccessRoute,
    isSuperAdmin: is_super_admin,
    isVivacityTeam: is_vivacity_team,
  };
};
