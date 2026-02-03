import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Plus,
  Trash2,
  UserPlus,
  Edit2,
  Check,
  X,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatWithDetails, UserBasic } from '@/types/accountabilityChart';

interface SeatCardProps {
  seat: SeatWithDetails;
  canEdit: boolean;
  tenantUsers: UserBasic[];
  onUpdateSeat: (id: string, name: string) => void;
  onDeleteSeat: (id: string) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssign: (seatId: string, userId: string, type: 'Primary' | 'Secondary') => void;
  onUnassign: (assignmentId: string) => void;
}

export function SeatCard({
  seat,
  canEdit,
  tenantUsers,
  onUpdateSeat,
  onDeleteSeat,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssign,
  onUnassign,
}: SeatCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(seat.seat_name);
  const [newRole, setNewRole] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleText, setEditRoleText] = useState('');

  const handleSaveName = () => {
    if (editName.trim() && editName !== seat.seat_name) {
      onUpdateSeat(seat.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleAddRole = () => {
    if (newRole.trim()) {
      onAddRole(seat.id, newRole.trim());
      setNewRole('');
    }
  };

  const handleSaveRole = (roleId: string) => {
    if (editRoleText.trim()) {
      onUpdateRole(roleId, editRoleText.trim());
    }
    setEditingRoleId(null);
  };

  const primaryAssignment = seat.assignments.find(a => a.assignment_type === 'Primary');
  const secondaryAssignments = seat.assignments.filter(a => a.assignment_type === 'Secondary');
  const assignedUserIds = seat.assignments.map(a => a.user_id);
  const availableUsers = tenantUsers.filter(u => !assignedUserIds.includes(u.user_uuid));

  const getInitials = (user?: UserBasic) => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getUserName = (user?: UserBasic) => {
    if (!user) return 'Unknown';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveName}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditing(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <h4 className="font-semibold text-sm">{seat.seat_name}</h4>
          )}

          {canEdit && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-3 w-3 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDeleteSeat(seat.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Primary Owner */}
        <div className="mt-2">
          {primaryAssignment ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={primaryAssignment.user?.avatar_url} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(primaryAssignment.user)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">{getUserName(primaryAssignment.user)}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-auto"
                  onClick={() => onUnassign(primaryAssignment.id)}
                >
                  <X className="h-2 w-2" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <UserPlus className="h-3 w-3" />
                      Assign Primary
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {availableUsers.length === 0 ? (
                      <DropdownMenuItem disabled>No users available</DropdownMenuItem>
                    ) : (
                      availableUsers.map(user => (
                        <DropdownMenuItem
                          key={user.user_uuid}
                          onClick={() => onAssign(seat.id, user.user_uuid, 'Primary')}
                        >
                          <Avatar className="h-5 w-5 mr-2">
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback className="text-[8px]">
                              {getInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          {getUserName(user)}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Badge variant="outline" className="text-xs gap-1">
                  <User className="h-3 w-3" />
                  No owner
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Secondary Owners */}
        {secondaryAssignments.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {secondaryAssignments.map(a => (
              <Badge key={a.id} variant="secondary" className="text-[10px] gap-1 py-0">
                {getUserName(a.user)}
                {canEdit && (
                  <X 
                    className="h-2 w-2 cursor-pointer" 
                    onClick={() => onUnassign(a.id)} 
                  />
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 rounded-none border-t text-xs gap-1"
          >
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {seat.roles.length} accountabilities
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="p-3 pt-2 space-y-2">
            {/* Role bullets */}
            <ul className="space-y-1">
              {seat.roles.map((role) => (
                <li key={role.id} className="flex items-start gap-2 group">
                  <span className="text-muted-foreground mt-1">•</span>
                  {editingRoleId === role.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editRoleText}
                        onChange={(e) => setEditRoleText(e.target.value)}
                        className="h-6 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRole(role.id);
                          if (e.key === 'Escape') setEditingRoleId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleSaveRole(role.id)}>
                        <Check className="h-2 w-2" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs flex-1">{role.role_text}</span>
                      {canEdit && (
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            onClick={() => {
                              setEditingRoleId(role.id);
                              setEditRoleText(role.role_text);
                            }}
                          >
                            <Edit2 className="h-2 w-2" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-destructive"
                            onClick={() => onDeleteRole(role.id)}
                          >
                            <Trash2 className="h-2 w-2" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>

            {/* Add role input */}
            {canEdit && (
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Add accountability..."
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRole();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={handleAddRole}
                  disabled={!newRole.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Add secondary owner */}
            {canEdit && availableUsers.length > 0 && primaryAssignment && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 w-full">
                    <UserPlus className="h-3 w-3" />
                    Add Secondary
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {availableUsers.map(user => (
                    <DropdownMenuItem
                      key={user.user_uuid}
                      onClick={() => onAssign(seat.id, user.user_uuid, 'Secondary')}
                    >
                      <Avatar className="h-5 w-5 mr-2">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      {getUserName(user)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
