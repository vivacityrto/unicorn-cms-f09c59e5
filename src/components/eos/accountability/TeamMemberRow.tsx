import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FunctionTeamMember } from '@/hooks/useFunctionTeamMembers';

interface TeamMemberRowProps {
  member: FunctionTeamMember;
  canEdit: boolean;
  onRemove: () => void;
  showDragHandle?: boolean;
}

/**
 * Compact row for displaying a team member under a Functional Lead
 */
export function TeamMemberRow({
  member,
  canEdit,
  onRemove,
  showDragHandle = true,
}: TeamMemberRowProps) {
  const user = member.user;

  const getInitials = () => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getFullName = () => {
    if (!user) return 'Unknown User';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  };

  const getRoleBadge = () => {
    if (!user?.unicorn_role) return null;
    
    if (user.unicorn_role === 'Team Leader') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
          Team Leader
        </Badge>
      );
    }
    if (user.unicorn_role === 'Team Member') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
          Team Member
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md group hover:bg-muted/50 transition-colors">
      {/* Drag handle */}
      {canEdit && showDragHandle && (
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}

      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={user?.avatar_url || undefined} />
        <AvatarFallback className="text-[10px] font-medium">
          {getInitials()}
        </AvatarFallback>
      </Avatar>

      {/* Name & Email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{getFullName()}</span>
          {getRoleBadge()}
        </div>
        {user?.email && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
      </div>

      {/* Remove button */}
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      )}
    </div>
  );
}
