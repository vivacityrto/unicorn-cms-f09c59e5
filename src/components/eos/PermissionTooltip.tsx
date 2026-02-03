import { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC, Permission } from '@/hooks/useRBAC';
import { useRestrictedActionLog } from '@/hooks/useRestrictedActionLog';

// Map permissions to human-readable role requirements
const PERMISSION_REQUIRED_ROLES: Record<Permission, string> = {
  'administration:access': 'Super Admin',
  'advanced_features:access': 'Team Leader or Team Member',
  'eos:access': 'Vivacity Team (Super Admin, Team Leader, or Team Member)',
  'vto:edit': 'Team Leader or Team Member',
  'eos_meetings:schedule': 'Team Leader or Super Admin',
  'eos_meetings:edit': 'Team Leader or Super Admin',
  'qc:schedule': 'Team Leader or Super Admin',
  'qc:edit': 'Team Leader or Super Admin',
  'qc:view_all': 'Team Leader or Super Admin',
  'qc:sign': 'Vivacity Team',
  'rocks:create': 'Vivacity Team',
  'rocks:edit_own': 'Vivacity Team',
  'rocks:edit_others': 'Team Leader or Super Admin',
  'risks:create': 'Vivacity Team',
  'risks:escalate': 'Team Leader or Super Admin',
  'risks:close_critical': 'Super Admin only',
  'agenda_templates:manage': 'Super Admin',
};

// Map unicorn_role to display name
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'Super Admin': 'Super Admin',
  'Team Leader': 'Team Leader',
  'Team Member': 'Team Member',
  'Admin': 'Admin',
  'User': 'General User',
  'General User': 'General User',
};

// Context-appropriate role display - don't show Vivacity roles to clients
const getContextAwareRoleName = (role: string, isVivacityTeam: boolean): string => {
  const displayName = ROLE_DISPLAY_NAMES[role] || role;
  
  // For client users, simplify Vivacity role names if somehow exposed
  if (!isVivacityTeam) {
    if (['Team Leader', 'Team Member'].includes(role)) {
      return 'Staff';
    }
  }
  
  return displayName;
};

export interface PermissionTooltipProps {
  /** The permission being checked */
  permission: Permission;
  /** Child element to wrap (typically a Button) */
  children: ReactNode;
  /** Human-readable action description, e.g., "schedule meetings" */
  action?: string;
  /** Whether to log attempts when user clicks on disabled element */
  logAttempt?: boolean;
  /** Whether the action is currently allowed (overrides hasPermission check) */
  hasAccess?: boolean;
}

/**
 * Wraps a child element with a tooltip that explains why an action is disabled.
 * Shows the required role, current user role, and next steps.
 * 
 * Usage:
 * ```tsx
 * <PermissionTooltip permission="eos_meetings:schedule" action="schedule meetings">
 *   <Button disabled={!canScheduleMeetings()}>Schedule Meeting</Button>
 * </PermissionTooltip>
 * ```
 */
export function PermissionTooltip({
  permission,
  children,
  action,
  logAttempt = false,
  hasAccess,
}: PermissionTooltipProps) {
  const { profile } = useAuth();
  const { hasPermission, isVivacityTeam } = useRBAC();
  const { logAttempt: logRestrictedAction } = useRestrictedActionLog();

  // Determine if user has access - either via override or permission check
  const userHasAccess = hasAccess !== undefined ? hasAccess : hasPermission(permission);

  // If user has access, just render children without tooltip
  if (userHasAccess) {
    return <>{children}</>;
  }

  const userRole = profile?.unicorn_role || 'General User';
  const displayRole = getContextAwareRoleName(userRole, isVivacityTeam);
  const requiredRole = PERMISSION_REQUIRED_ROLES[permission] || 'appropriate permissions';

  // Determine next step guidance based on user context
  const nextStep = isVivacityTeam
    ? 'Contact your Team Leader or Super Admin for access.'
    : 'Contact your organisation admin to request this permission.';

  const actionText = action || 'perform this action';

  const handleClick = () => {
    if (logAttempt && profile?.user_uuid) {
      logRestrictedAction({
        permission,
        action: actionText,
        userRole,
      });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span onClick={handleClick} className="inline-block">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent 
          className="max-w-xs p-3 space-y-2"
          side="top"
          align="center"
        >
          <p className="font-medium text-sm">
            This action requires {requiredRole} access.
          </p>
          <p className="text-xs text-muted-foreground">
            Your role: <span className="font-medium">{displayRole}</span>
          </p>
          <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
            {nextStep}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Simplified tooltip for custom permission messages (non-standard permissions)
 */
export interface CustomPermissionTooltipProps {
  /** Whether the action is allowed */
  hasAccess: boolean;
  /** Child element to wrap */
  children: ReactNode;
  /** Message to show when action is not allowed */
  message: string;
  /** Additional guidance text */
  guidance?: string;
}

export function CustomPermissionTooltip({
  hasAccess,
  children,
  message,
  guidance,
}: CustomPermissionTooltipProps) {
  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-block">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent 
          className="max-w-xs p-3 space-y-2"
          side="top"
          align="center"
        >
          <p className="text-sm">{message}</p>
          {guidance && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
              {guidance}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
