import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, UserPlus, Users } from 'lucide-react';
import { TeamMemberRow } from './TeamMemberRow';
import { useFunctionTeamMembers, type FunctionTeamMember } from '@/hooks/useFunctionTeamMembers';
import { useVivacityTeamUsers, type VivacityTeamUser } from '@/hooks/useVivacityTeamUsers';
import { useAuth } from '@/hooks/useAuth';

interface TeamMembersSectionProps {
  functionId: string;
  canEdit: boolean;
}

/**
 * Team Members section for Functional Lead cards.
 * Shows Vivacity Team users who report to this Functional Lead.
 */
export function TeamMembersSection({ functionId, canEdit }: TeamMembersSectionProps) {
  const { profile } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const { teamMembers, addTeamMember, removeTeamMember } = useFunctionTeamMembers(functionId);
  const { data: vivacityUsers = [] } = useVivacityTeamUsers();

  // Filter out users already assigned
  const assignedUserIds = new Set(teamMembers.map(tm => tm.user_id));
  const availableUsers = vivacityUsers.filter(u => !assignedUserIds.has(u.user_uuid));

  // Filter by search
  const filteredUsers = availableUsers.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    const email = u.email?.toLowerCase() || '';
    const query = searchValue.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const handleAddMember = (userId: string) => {
    if (!profile?.user_uuid) return;
    
    addTeamMember.mutate({
      functionId,
      userId,
      createdBy: profile.user_uuid,
    });
    setShowAddDialog(false);
    setSearchValue('');
  };

  const handleRemoveMember = (memberId: string) => {
    removeTeamMember.mutate(memberId);
  };

  const getInitials = (user: VivacityTeamUser) => {
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getFullName = (user: VivacityTeamUser) => {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  };

  return (
    <div className="space-y-2 pt-2 border-t border-muted">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Users className="h-3 w-3" />
              Team Members ({teamMembers.length})
            </Button>
          </CollapsibleTrigger>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setShowAddDialog(true)}
            >
              <UserPlus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        <CollapsibleContent className="space-y-1.5 pt-2">
          {/* Team member rows */}
          {teamMembers.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              canEdit={canEdit}
              onRemove={() => handleRemoveMember(member.id)}
            />
          ))}

          {/* Empty state */}
          {teamMembers.length === 0 && (
            <div className="py-4 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No team members assigned yet.
              </p>
              <p className="text-xs text-muted-foreground">
                Add direct reports under this lead.
              </p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Select a Vivacity Team user to add as a direct report.
            </DialogDescription>
          </DialogHeader>

          <Command className="rounded-lg border shadow-md">
            <CommandInput 
              placeholder="Search team members..." 
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No team members found.</CommandEmpty>
              <CommandGroup heading="Vivacity Team">
                {filteredUsers.map((user) => (
                  <CommandItem
                    key={user.user_uuid}
                    value={`${user.first_name} ${user.last_name} ${user.email}`}
                    onSelect={() => handleAddMember(user.user_uuid)}
                    className="flex items-center gap-3 py-2 cursor-pointer"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {getFullName(user)}
                        </span>
                        {user.unicorn_role === 'Team Leader' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Team Leader
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                      {user.job_title && (
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {user.job_title}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {availableUsers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              All Vivacity Team members are already assigned to this function.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
