import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { UserCircle, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

interface TaskAssigneeButtonProps {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  disabled?: boolean;
  updating?: boolean;
  onAssign: (userId: string | null) => void;
}

export function TaskAssigneeButton({
  assigneeId,
  assigneeName,
  assigneeAvatar,
  disabled,
  updating,
  onAssign,
}: TaskAssigneeButtonProps) {
  const [open, setOpen] = useState(false);
  const { data: teamUsers = [] } = useVivacityTeamUsers();

  const handleSelect = (userId: string | null) => {
    onAssign(userId);
    setOpen(false);
  };

  if (updating) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              disabled={disabled}
              className={cn(
                "shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {assigneeId ? (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={assigneeAvatar || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                    {assigneeName
                      ? assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2)
                      : '??'}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <UserCircle className="h-6 w-6 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {assigneeName || 'Unassigned – click to assign'}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-48 p-1">
        <div className="space-y-0.5">
          {assigneeId && (
            <button
              onClick={() => handleSelect(null)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span>Unassign</span>
            </button>
          )}
          {teamUsers.map((user) => (
            <button
              key={user.user_uuid}
              onClick={() => handleSelect(user.user_uuid)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors",
                user.user_uuid === assigneeId && "bg-primary/10 font-medium"
              )}
            >
              <Avatar className="h-5 w-5">
                {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                <AvatarFallback className="text-[8px]">
                  {user.first_name?.[0]}{user.last_name?.[0]}
                </AvatarFallback>
              </Avatar>
              <span>{user.first_name}</span>
            </button>
          ))}
          {teamUsers.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">No team members</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
