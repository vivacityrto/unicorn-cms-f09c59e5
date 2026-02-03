import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  AlertCircle,
  GripVertical,
  Target,
  Calendar,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatWithDetails, UserBasic } from '@/types/accountabilityChart';
import { EOS_SEAT_ROLE_LABELS, EOS_ROLE_COLORS, type EosSeatRoleType } from '@/types/accountabilityChart';

interface DraggableSeatCardProps {
  seat: SeatWithDetails;
  functionId: string;
  canEdit: boolean;
  tenantUsers: UserBasic[];
  onUpdateSeat: (id: string, name: string) => void;
  onDeleteSeat: (id: string) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssign: (seatId: string, userId: string, type: 'Primary' | 'Secondary') => void;
  onUnassign: (assignmentId: string) => void;
  onClick?: () => void;
}

export function DraggableSeatCard({
  seat,
  functionId,
  canEdit,
  tenantUsers,
  onUpdateSeat,
  onDeleteSeat,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssign,
  onUnassign,
  onClick,
}: DraggableSeatCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(seat.seat_name);
  const [newRole, setNewRole] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleText, setEditRoleText] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: seat.id,
    data: { type: 'seat', seat, functionId },
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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

  const isVacant = !primaryAssignment;
  const roleCount = seat.roles.length;
  const hasAccountabilityWarning = (roleCount > 0 && roleCount < 3) || roleCount > 7;
  const roleType = seat.eos_role_type;

  const getInitials = (user?: UserBasic) => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getUserName = (user?: UserBasic) => {
    if (!user) return 'Unknown';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
  };

  // Determine card status color
  const getStatusIndicator = () => {
    if (isVacant) return 'border-l-destructive bg-destructive/5';
    if (hasAccountabilityWarning) return 'border-l-warning bg-warning/5';
    return 'border-l-emerald-500 bg-emerald-500/5';
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'shadow-sm hover:shadow-md transition-all border-l-4 cursor-pointer',
        getStatusIndicator(),
        isDragging && 'opacity-50 ring-2 ring-primary shadow-lg'
      )}
      onClick={(e) => {
        // Don't trigger click when interacting with inputs or buttons
        if ((e.target as HTMLElement).closest('input, button, [role="menu"]')) return;
        onClick?.();
      }}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Drag Handle */}
          {canEdit && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded mt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm truncate">{seat.seat_name}</h4>
                {roleType && (
                  <Badge 
                    className={cn(
                      'text-[10px] px-1.5 py-0 shrink-0',
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

          {/* Status Icons */}
          <div className="flex items-center gap-1">
            {isVacant && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <XCircle className="h-4 w-4 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Seat is vacant - needs owner</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isVacant && !hasAccountabilityWarning && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>

          {canEdit && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
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
                <AvatarImage src={primaryAssignment.user?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(primaryAssignment.user)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate">{getUserName(primaryAssignment.user)}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-auto shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnassign(primaryAssignment.id);
                  }}
                >
                  <X className="h-2 w-2" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive border-destructive/30">
                      <UserPlus className="h-3 w-3" />
                      Assign Owner
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
                            <AvatarImage src={user.avatar_url || undefined} />
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
                <Badge variant="destructive" className="text-xs gap-1">
                  <User className="h-3 w-3" />
                  Vacant
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            {seat.linkedData?.active_rocks_count || 0} rocks
          </span>
          {seat.linkedData && (seat.linkedData.meetings_attended_count > 0 || seat.linkedData.meetings_missed_count > 0) && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {seat.linkedData.meetings_attended_count}/{seat.linkedData.meetings_attended_count + seat.linkedData.meetings_missed_count}
            </span>
          )}
        </div>
      </CardHeader>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full h-7 rounded-none border-t text-xs gap-1",
              hasAccountabilityWarning && "text-warning"
            )}
          >
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {roleCount} accountabilities
            {hasAccountabilityWarning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="h-3 w-3 text-warning" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{roleCount < 3 ? 'Needs at least 3 accountabilities' : 'Should have at most 7 accountabilities'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent onClick={(e) => e.stopPropagation()}>
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
                        <AvatarImage src={user.avatar_url || undefined} />
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

            {/* Secondary Owners */}
            {secondaryAssignments.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
                <span className="text-[10px] text-muted-foreground">Secondary:</span>
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
