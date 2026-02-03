import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Plus,
  Trash2,
  UserPlus,
  Edit2,
  Check,
  X,
  GripVertical,
  ArrowRightLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FunctionWithSeats, UserBasic, SeatWithDetails } from '@/types/accountabilityChart';

interface SubFunctionCardProps {
  func: FunctionWithSeats;
  canEdit: boolean;
  tenantUsers: UserBasic[];
  parentLeads: FunctionWithSeats[];
  onUpdateFunction: (id: string, name: string) => void;
  onDeleteFunction: (id: string) => void;
  onMoveFunction: (functionId: string, newParentId: string | null, newIndex: number) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssignOwner: (seatId: string, userId: string) => void;
  onUnassignOwner: (assignmentId: string) => void;
  onCreateSeatForFunction?: (functionId: string) => void;
}

/**
 * Compact sub-function card displayed nested within a Functional Lead
 */
export function SubFunctionCard({
  func,
  canEdit,
  tenantUsers,
  parentLeads,
  onUpdateFunction,
  onDeleteFunction,
  onMoveFunction,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssignOwner,
  onUnassignOwner,
  onCreateSeatForFunction,
}: SubFunctionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(func.name);
  const [newRole, setNewRole] = useState('');
  const [showRoles, setShowRoles] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleText, setEditRoleText] = useState('');

  const primarySeat: SeatWithDetails | undefined = func.seats[0];
  const primaryAssignment = primarySeat?.assignments.find(a => a.assignment_type === 'Primary');
  const owner = primaryAssignment?.user;
  const roles = primarySeat?.roles || [];

  const assignedUserIds = primarySeat?.assignments.map(a => a.user_id) || [];
  const availableUsers = tenantUsers.filter(u => !assignedUserIds.includes(u.user_uuid));

  // Other leads to move to (excluding current parent)
  const otherLeads = parentLeads.filter(lead => lead.id !== func.parent_function_id);

  const handleSaveName = () => {
    if (editName.trim() && editName !== func.name) {
      onUpdateFunction(func.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleAddRole = () => {
    if (newRole.trim() && primarySeat) {
      onAddRole(primarySeat.id, newRole.trim());
      setNewRole('');
    }
  };

  const handleSaveRole = (roleId: string) => {
    if (editRoleText.trim()) {
      onUpdateRole(roleId, editRoleText.trim());
    }
    setEditingRoleId(null);
  };

  const getInitials = (user?: UserBasic) => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getUserName = (user?: UserBasic) => {
    if (!user) return 'Unknown';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
  };

  // If no seat yet, show minimal card
  if (!primarySeat) {
    return (
      <Card className="border-dashed border border-muted-foreground/20">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{func.name}</span>
          {canEdit && onCreateSeatForFunction && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onCreateSeatForFunction(func.id)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Initialize
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-muted/50 bg-muted/20">
      <CardContent className="p-3 space-y-2">
        {/* Header row: drag handle, name, owner, menu */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
          )}
          
          {/* Name */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
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
              <span className="font-medium text-sm truncate">{func.name}</span>
            )}
          </div>

          {/* Owner */}
          {owner ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <Avatar className="h-6 w-6">
                <AvatarImage src={owner.avatar_url || undefined} />
                <AvatarFallback className="text-[9px]">
                  {getInitials(owner)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {getUserName(owner).split(' ')[0]}
              </span>
              {canEdit && primaryAssignment && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => onUnassignOwner(primaryAssignment.id)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          ) : canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
                  <UserPlus className="h-3 w-3 mr-1" />
                  Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-48 overflow-y-auto w-56">
                {availableUsers.length === 0 ? (
                  <DropdownMenuItem disabled>No users available</DropdownMenuItem>
                ) : (
                  availableUsers.map(user => (
                    <DropdownMenuItem
                      key={user.user_uuid}
                      onClick={() => onAssignOwner(primarySeat.id, user.user_uuid)}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">{getInitials(user)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{getUserName(user)}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Vacant</Badge>
          )}

          {/* Roles toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => setShowRoles(!showRoles)}
          >
            {roles.length} roles
          </Button>

          {/* Menu */}
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
                {otherLeads.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      Move to...
                    </DropdownMenuItem>
                    {otherLeads.map(lead => (
                      <DropdownMenuItem
                        key={lead.id}
                        onClick={() => onMoveFunction(func.id, lead.id, 0)}
                        className="pl-6"
                      >
                        <ArrowRightLeft className="h-3 w-3 mr-2" />
                        {lead.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteFunction(func.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Roles section (collapsible) */}
        {showRoles && (
          <div className="pl-6 space-y-1 pt-1 border-t border-muted">
            {roles.map((role) => (
              <div key={role.id} className="flex items-start gap-2 group text-xs">
                <span className="text-muted-foreground">•</span>
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
                      <Check className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1">{role.role_text}</span>
                    {canEdit && (
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4"
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
                          className="h-4 w-4 text-destructive"
                          onClick={() => onDeleteRole(role.id)}
                        >
                          <Trash2 className="h-2 w-2" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Add role input */}
            {canEdit && (
              <div className="flex items-center gap-1 pt-1">
                <Input
                  placeholder="Add role..."
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-6 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRole();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={handleAddRole}
                  disabled={!newRole.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
