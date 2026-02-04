import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, ChevronsUpDown, Users, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVivacityTeamUsers, VivacityTeamUser } from '@/hooks/useVivacityTeamUsers';

/**
 * VivacityTeamPicker - Unified EOS People Picker
 * 
 * This component is the single source of truth for selecting Vivacity Team users
 * in all EOS contexts. EOS is internal-only, so only Super Admin, Team Leader,
 * and Team Member roles are shown.
 * 
 * Usage:
 * - Meetings: Facilitator, Participants
 * - Quarterly Conversations: Reviewee, Manager
 * - Accountability Chart: Owner, Team Members
 * - Rocks: Owner assignments
 */

export type RoleBadgeVariant = 'default' | 'secondary' | 'outline';

const getRoleBadgeVariant = (role: string | null): RoleBadgeVariant => {
  switch (role) {
    case 'Super Admin': return 'default';
    case 'Team Leader': return 'secondary';
    case 'Team Member': return 'outline';
    default: return 'outline';
  }
};

const getInitials = (user: VivacityTeamUser | undefined): string => {
  if (!user) return '?';
  const first = user.first_name?.[0] || '';
  const last = user.last_name?.[0] || '';
  return (first + last).toUpperCase() || user.email[0].toUpperCase();
};

const getDisplayName = (user: VivacityTeamUser | undefined): string => {
  if (!user) return '';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
};

interface VivacityTeamPickerSingleProps {
  mode: 'single';
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Filter to only show specific roles (e.g., managers only = ['Super Admin', 'Team Leader']) */
  roleFilter?: string[];
  /** User IDs to exclude from selection */
  excludeUserIds?: string[];
  className?: string;
}

interface VivacityTeamPickerMultiProps {
  mode: 'multi';
  value: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Filter to only show specific roles */
  roleFilter?: string[];
  /** User IDs to exclude from selection */
  excludeUserIds?: string[];
  className?: string;
}

type VivacityTeamPickerProps = VivacityTeamPickerSingleProps | VivacityTeamPickerMultiProps;

export function VivacityTeamPicker(props: VivacityTeamPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: vivacityUsers, isLoading } = useVivacityTeamUsers();

  // Filter users based on roleFilter and excludeUserIds
  const filteredUsers = useMemo(() => {
    if (!vivacityUsers) return [];
    
    let result = [...vivacityUsers];
    
    if (props.roleFilter && props.roleFilter.length > 0) {
      result = result.filter(u => u.unicorn_role && props.roleFilter!.includes(u.unicorn_role));
    }
    
    if (props.excludeUserIds && props.excludeUserIds.length > 0) {
      result = result.filter(u => !props.excludeUserIds!.includes(u.user_uuid));
    }
    
    return result;
  }, [vivacityUsers, props.roleFilter, props.excludeUserIds]);

  const getSelectedUser = (userId: string): VivacityTeamUser | undefined => {
    return vivacityUsers?.find(u => u.user_uuid === userId);
  };

  if (props.mode === 'single') {
    const selectedUser = getSelectedUser(props.value);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={props.disabled}
            className={cn("w-full justify-between h-auto min-h-10", props.className)}
          >
            {selectedUser ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={selectedUser.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">{getInitials(selectedUser)}</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <span>{getDisplayName(selectedUser)}</span>
                  {selectedUser.unicorn_role && (
                    <Badge variant={getRoleBadgeVariant(selectedUser.unicorn_role)} className="ml-2 text-xs">
                      {selectedUser.unicorn_role}
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">{props.placeholder || 'Select team member...'}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search team members..." />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2">Loading...</span>
                  </div>
                ) : (
                  'No team members found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredUsers.map((user) => (
                  <CommandItem
                    key={user.user_uuid}
                    value={`${user.first_name} ${user.last_name} ${user.email}`}
                    onSelect={() => {
                      props.onChange(user.user_uuid);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        props.value === user.user_uuid ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col flex-1">
                      <span>{getDisplayName(user)}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                    {user.unicorn_role && (
                      <Badge variant={getRoleBadgeVariant(user.unicorn_role)} className="text-xs ml-2">
                        {user.unicorn_role}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  // Multi-select mode
  const selectedUsers = props.value.map(id => getSelectedUser(id)).filter(Boolean) as VivacityTeamUser[];

  const toggleUser = (userId: string) => {
    if (props.value.includes(userId)) {
      props.onChange(props.value.filter(id => id !== userId));
    } else {
      props.onChange([...props.value, userId]);
    }
  };

  const removeUser = (userId: string) => {
    props.onChange(props.value.filter(id => id !== userId));
  };

  return (
    <div className={cn("space-y-2", props.className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={props.disabled}
            className="w-full justify-between h-auto min-h-10"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {selectedUsers.length === 0 
                  ? (props.placeholder || 'Select team members...')
                  : `${selectedUsers.length} selected`
                }
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search team members..." />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2">Loading...</span>
                  </div>
                ) : (
                  'No team members found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredUsers.map((user) => (
                  <CommandItem
                    key={user.user_uuid}
                    value={`${user.first_name} ${user.last_name} ${user.email}`}
                    onSelect={() => toggleUser(user.user_uuid)}
                  >
                    <Checkbox
                      checked={props.value.includes(user.user_uuid)}
                      className="mr-2"
                    />
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col flex-1">
                      <span>{getDisplayName(user)}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                    {user.unicorn_role && (
                      <Badge variant={getRoleBadgeVariant(user.unicorn_role)} className="text-xs ml-2">
                        {user.unicorn_role}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected users display */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <Badge key={user.user_uuid} variant="secondary" className="gap-1 pr-1">
              <Avatar className="h-4 w-4">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-[8px]">{getInitials(user)}</AvatarFallback>
              </Avatar>
              <span className="text-xs">{getDisplayName(user)}</span>
              {!props.disabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-destructive/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeUser(user.user_uuid);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline list display of Vivacity Team users (read-only)
 */
export function VivacityTeamUserList({ userIds }: { userIds: string[] }) {
  const { data: vivacityUsers } = useVivacityTeamUsers();
  
  const users = userIds
    .map(id => vivacityUsers?.find(u => u.user_uuid === id))
    .filter(Boolean) as VivacityTeamUser[];

  if (users.length === 0) {
    return <span className="text-muted-foreground text-sm">No participants</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {users.map((user) => (
        <Badge key={user.user_uuid} variant="outline" className="gap-1">
          <Avatar className="h-4 w-4">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="text-[8px]">{getInitials(user)}</AvatarFallback>
          </Avatar>
          <span className="text-xs">{getDisplayName(user)}</span>
        </Badge>
      ))}
    </div>
  );
}
