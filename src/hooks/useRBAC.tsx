import { useAuth } from './useAuth';

// RBAC Permissions Configuration
export type Permission = 
  | 'administration:access'
  | 'advanced_features:access'
  | 'eos:access'  // NEW: EOS access permission
  | 'vto:edit'
  | 'eos_meetings:schedule'
  | 'eos_meetings:edit'
  | 'qc:schedule'
  | 'qc:edit'
  | 'qc:view_all'
  | 'qc:sign'
  | 'rocks:create'
  | 'rocks:edit_own'
  | 'rocks:edit_others'
  | 'risks:create'
  | 'risks:escalate'
  | 'risks:close_critical'
  | 'agenda_templates:manage';

// Role-based permission mappings
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // SuperAdmin has all permissions including administration and EOS
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
  // Super Admin (alternate spelling used in DB)
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
  // Team Leader - Vivacity staff, sees everything EXCEPT administration, HAS EOS access
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
  // Team Member - Vivacity staff, limited escalation abilities, HAS EOS access
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
  // Admin - Client tenant admin, NO EOS access (clients don't use EOS)
  'Admin': [
    // NO eos:access - EOS is Vivacity-only
  ],
  // User - Client tenant user, NO EOS access
  'User': [
    // NO eos:access - EOS is Vivacity-only
  ],
  // General User - NO EOS access
  'General User': [
    // NO eos:access - EOS is Vivacity-only
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

// EOS routes - Vivacity Team only (Super Admin, Team Leader, Team Member)
export const EOS_ROUTES = [
  '/eos',
  '/eos/overview',
  '/eos/scorecard',
  '/eos/vto',
  '/eos/mission-control',
  '/eos/rocks',
  '/eos/flight-plan',
  '/eos/risks-opportunities',
  '/eos/todos',
  '/eos/meetings',
  '/eos/qc',
  '/eos/quarterly-conversations',
  '/eos/accountability',
  '/eos/leadership',
  '/eos/rock-analysis',
  '/eos/client-impact',
  '/processes',
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
   * Check if current user can access EOS features
   * EOS is Vivacity-only - clients cannot access
   */
  const canAccessEOS = (): boolean => {
    return hasPermission('eos:access');
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
    
    // Check EOS routes - Vivacity Team only
    if (EOS_ROUTES.some(route => path.startsWith(route))) {
      return canAccessEOS();
    }
    
    // All other routes are accessible
    return true;
  };

  /**
   * Check if current user can create rocks
   */
  const canCreateRocks = (): boolean => {
    return hasPermission('rocks:create');
  };

  /**
   * Check if current user can edit their own rocks
   */
  const canEditOwnRocks = (): boolean => {
    return hasPermission('rocks:edit_own');
  };

  /**
   * Check if current user can edit rocks owned by others
   */
  const canEditOthersRocks = (): boolean => {
    return hasPermission('rocks:edit_others');
  };

  /**
   * Check if current user can create risks/opportunities
   */
  const canCreateRisks = (): boolean => {
    return hasPermission('risks:create');
  };

  /**
   * Check if current user can escalate risks
   */
  const canEscalateRisks = (): boolean => {
    return hasPermission('risks:escalate');
  };

  /**
   * Check if current user can close critical risks
   */
  const canCloseCriticalRisks = (): boolean => {
    return hasPermission('risks:close_critical');
  };

  /**
   * Check if current user can manage agenda templates
   */
  const canManageAgendaTemplates = (): boolean => {
    return hasPermission('agenda_templates:manage');
  };

  /**
   * Check if current user can sign quarterly conversations
   */
  const canSignQC = (): boolean => {
    return hasPermission('qc:sign');
  };

  return {
    hasPermission,
    canAccessAdmin,
    canAccessAdvanced,
    canAccessEOS,
    canEditVTO,
    canScheduleMeetings,
    canEditMeetings,
    canScheduleQC,
    canEditQC,
    canViewAllQC,
    canAccessRoute,
    canCreateRocks,
    canEditOwnRocks,
    canEditOthersRocks,
    canCreateRisks,
    canEscalateRisks,
    canCloseCriticalRisks,
    canManageAgendaTemplates,
    canSignQC,
    isSuperAdmin: is_super_admin,
    isVivacityTeam: is_vivacity_team,
  };
};
