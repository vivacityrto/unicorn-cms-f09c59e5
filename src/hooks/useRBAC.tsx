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
  // SuperAdmin has all permissions
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
  '/admin/manage-emails',
  '/admin/user-audit',
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
 * Provides permission checking functions based on user's global_role
 */
export const useRBAC = () => {
  const { profile, isSuperAdmin } = useAuth();

  /**
   * Check if current user has a specific permission
   */
  const hasPermission = (permission: Permission): boolean => {
    // SuperAdmin always has all permissions
    if (isSuperAdmin()) return true;

    const userRole = profile?.global_role || 'General User';
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
    isSuperAdmin: isSuperAdmin(),
  };
};
