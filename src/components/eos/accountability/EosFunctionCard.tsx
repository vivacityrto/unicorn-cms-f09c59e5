import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreVertical,
  Plus,
  Trash2,
  UserPlus,
  Edit2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FunctionWithSeats, UserBasic, SeatWithDetails } from '@/types/accountabilityChart';
import { EOS_SEAT_ROLE_LABELS, EOS_ROLE_COLORS, type EosSeatRoleType } from '@/types/accountabilityChart';

interface EosFunctionCardProps {
  func: FunctionWithSeats;
  canEdit: boolean;
  tenantUsers: UserBasic[];
  onUpdateFunction: (id: string, name: string) => void;
  onDeleteFunction: (id: string) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssignOwner: (seatId: string, userId: string) => void;
  onUnassignOwner: (assignmentId: string) => void;
  onCreateSeatForFunction?: (functionId: string) => void;
  onClick?: () => void;
}

/**
 * EOS Function Card
 * 
 * Matches the standard EOS Accountability Chart layout:
 * - Function Name at top
 * - Owner (single person) 
 * - Roles (bulleted list of responsibilities)
 * 
 * In EOS, a "Function" IS the seat. One owner per function.
 */
export function EosFunctionCard({
  func,
  canEdit,
  tenantUsers,
  onUpdateFunction,
  onDeleteFunction,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssignOwner,
  onUnassignOwner,
  onCreateSeatForFunction,
  onClick,
}: EosFunctionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(func.name);
  const [newRole, setNewRole] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleText, setEditRoleText] = useState('');

  // Get the primary seat for this function (in EOS, each function has exactly one seat)
  const primarySeat: SeatWithDetails | undefined = func.seats[0];
  const primaryAssignment = primarySeat?.assignments.find(a => a.assignment_type === 'Primary');
  const owner = primaryAssignment?.user;
  const isVacant = !owner;
  const roles = primarySeat?.roles || [];
  const roleCount = roles.length;
  const hasAccountabilityWarning = (roleCount > 0 && roleCount < 3) || roleCount > 7;
  const roleType = primarySeat?.eos_role_type;

  // Available users for assignment (exclude already assigned)
  const assignedUserIds = primarySeat?.assignments.map(a => a.user_id) || [];
  const availableUsers = tenantUsers.filter(u => !assignedUserIds.includes(u.user_uuid));

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

  // If function has no seat yet, show a create prompt
  if (!primarySeat) {
    return (
      <Card className="w-72 min-w-72 border-dashed border-2 border-muted-foreground/30">
        <CardHeader className="p-4">
          <div className="flex items-center justify-between gap-2">
            {isEditing ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveName}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditing(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <h3 className="font-semibold flex-1">{func.name}</h3>
            )}
            {canEdit && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDeleteFunction(func.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {canEdit && onCreateSeatForFunction && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1"
              onClick={() => onCreateSeatForFunction(func.id)}
            >
              <Plus className="h-3 w-3" />
              Initialize Function
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'w-72 min-w-72 shadow-sm hover:shadow-md transition-all cursor-pointer',
        isVacant && 'border-destructive/50 bg-destructive/5',
        !isVacant && !hasAccountabilityWarning && 'border-primary/30 bg-primary/5'
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input, button, [role="menu"]')) return;
        onClick?.();
      }}
    >
      {/* Header: Function Name + Role Type */}
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveName}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditing(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="font-bold text-base">{func.name}</h3>
                {roleType && (
                  <Badge 
                    className={cn(
                      'text-[10px] px-1.5 py-0',
                      EOS_ROLE_COLORS[roleType].bg,
                      EOS_ROLE_COLORS[roleType].text
                    )}
                  >
                    {EOS_SEAT_ROLE_LABELS[roleType]}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isVacant ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <XCircle className="h-5 w-5 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Needs owner assigned</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : !hasAccountabilityWarning ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : null}
          </div>

          {canEdit && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteFunction(func.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Owner Section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner</p>
          {owner ? (
            <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
              <Avatar className="h-8 w-8">
                <AvatarImage src={owner.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {getInitials(owner)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getUserName(owner)}</p>
                <p className="text-xs text-muted-foreground truncate">{owner.email}</p>
              </div>
              {canEdit && primaryAssignment && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onUnassignOwner(primaryAssignment.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <div>
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full gap-1 text-destructive border-destructive/30">
                      <UserPlus className="h-4 w-4" />
                      Assign Owner
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-64 overflow-y-auto w-64">
                    {availableUsers.length === 0 ? (
                      <DropdownMenuItem disabled>
                        <span className="text-muted-foreground">No Vivacity Team users available</span>
                      </DropdownMenuItem>
                    ) : (
                      availableUsers.map(user => (
                        <DropdownMenuItem
                          key={user.user_uuid}
                          onClick={() => onAssignOwner(primarySeat.id, user.user_uuid)}
                          className="flex items-center gap-2 py-2"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-[8px]">
                              {getInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm truncate">{getUserName(user)}</span>
                            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Vacant
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Roles Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Roles</p>
            {hasAccountabilityWarning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-warning border-warning/50 gap-1 text-[10px]">
                      <AlertCircle className="h-3 w-3" />
                      {roleCount < 3 ? 'Need 3+' : '7 max'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{roleCount < 3 ? 'EOS recommends 3-7 roles per function' : 'EOS recommends max 7 roles per function'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Role bullets */}
          <ul className="space-y-1.5">
            {roles.map((role) => (
              <li key={role.id} className="flex items-start gap-2 group">
                <span className="text-muted-foreground mt-0.5">•</span>
                {editingRoleId === role.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={editRoleText}
                      onChange={(e) => setEditRoleText(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRole(role.id);
                        if (e.key === 'Escape') setEditingRoleId(null);
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSaveRole(role.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm flex-1">{role.role_text}</span>
                    {canEdit && (
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => {
                            setEditingRoleId(role.id);
                            setEditRoleText(role.role_text);
                          }}
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-destructive"
                          onClick={() => onDeleteRole(role.id)}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
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
            <div className="flex items-center gap-1 pt-1">
              <Input
                placeholder="Add role..."
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRole();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleAddRole}
                disabled={!newRole.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
