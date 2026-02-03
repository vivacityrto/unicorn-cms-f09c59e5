import { useState } from 'react';
import { Info, Check, X, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { Link } from 'react-router-dom';

// Define capabilities per role
interface RoleCapability {
  action: string;
  allowed: boolean;
}

const VIVACITY_ROLE_CAPABILITIES: Record<string, RoleCapability[]> = {
  'Super Admin': [
    { action: 'Create and edit all Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: true },
    { action: 'Manage agenda templates', allowed: true },
    { action: 'Close critical risks', allowed: true },
    { action: 'Edit Mission Control (V/TO)', allowed: true },
    { action: 'Access Administration section', allowed: true },
  ],
  'Team Leader': [
    { action: 'Create and edit all Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: true },
    { action: 'Manage agenda templates', allowed: false },
    { action: 'Close critical risks', allowed: false },
    { action: 'Edit Mission Control (V/TO)', allowed: true },
    { action: 'Access Administration section', allowed: false },
  ],
  'Team Member': [
    { action: 'Create and edit own Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: false },
    { action: 'Manage agenda templates', allowed: false },
    { action: 'Close critical risks', allowed: false },
    { action: 'Edit Mission Control (V/TO)', allowed: true },
    { action: 'Access Administration section', allowed: false },
  ],
};

const CLIENT_ROLE_CAPABILITIES: Record<string, RoleCapability[]> = {
  'Admin': [
    { action: 'Create and edit all Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: true },
    { action: 'Manage agenda templates', allowed: true },
    { action: 'Escalate risks', allowed: true },
    { action: 'Edit Mission Control (V/TO)', allowed: true },
    { action: 'Modify Accountability Chart', allowed: true },
  ],
  'User': [
    { action: 'Create and edit own Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: false },
    { action: 'Manage agenda templates', allowed: false },
    { action: 'Escalate risks', allowed: false },
    { action: 'Edit Mission Control (V/TO)', allowed: false },
    { action: 'Modify Accountability Chart', allowed: false },
  ],
  'General User': [
    { action: 'Create and edit own Rocks', allowed: true },
    { action: 'Schedule and facilitate meetings', allowed: false },
    { action: 'Manage agenda templates', allowed: false },
    { action: 'Escalate risks', allowed: false },
    { action: 'Edit Mission Control (V/TO)', allowed: false },
    { action: 'Modify Accountability Chart', allowed: false },
  ],
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

interface RoleInfoPanelProps {
  /** Optional: render as a button with custom content */
  trigger?: React.ReactNode;
}

/**
 * Shows current user's role and what they can/cannot do in EOS.
 * Can be triggered from info icons or "Why can't I do this?" links.
 */
export function RoleInfoPanel({ trigger }: RoleInfoPanelProps) {
  const { profile } = useAuth();
  const { isVivacityTeam } = useRBAC();
  const [open, setOpen] = useState(false);

  const userRole = profile?.unicorn_role || 'General User';
  const displayRole = ROLE_DISPLAY_NAMES[userRole] || userRole;
  
  // Get capabilities based on user context
  const capabilities = isVivacityTeam
    ? VIVACITY_ROLE_CAPABILITIES[userRole] || VIVACITY_ROLE_CAPABILITIES['Team Member']
    : CLIENT_ROLE_CAPABILITIES[userRole] || CLIENT_ROLE_CAPABILITIES['General User'];

  const contextLabel = isVivacityTeam ? 'Vivacity Team' : 'Organisation';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span className="text-xs">Role Info</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Info className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Your Role</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="default">{displayRole}</Badge>
            <span className="text-xs text-muted-foreground">({contextLabel})</span>
          </div>
        </div>
        
        <div className="p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            EOS Capabilities
          </p>
          <ul className="space-y-2">
            {capabilities.map((cap, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                {cap.allowed ? (
                  <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className={cap.allowed ? '' : 'text-muted-foreground'}>
                  {cap.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="p-4 border-t border-border bg-muted/30">
          <Link 
            to="/settings/roles" 
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={() => setOpen(false)}
          >
            View full role reference
            <span aria-hidden>→</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Inline "Why can't I do this?" link that opens the role info panel
 */
export function WhyCantILink() {
  return (
    <RoleInfoPanel
      trigger={
        <button className="text-xs text-muted-foreground hover:text-primary hover:underline inline-flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />
          Why can't I do this?
        </button>
      }
    />
  );
}
