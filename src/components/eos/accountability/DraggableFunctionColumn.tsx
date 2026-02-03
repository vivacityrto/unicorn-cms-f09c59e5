import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  GripVertical,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DraggableSeatCard } from './DraggableSeatCard';
import type { FunctionWithSeats, UserBasic } from '@/types/accountabilityChart';

interface DraggableFunctionColumnProps {
  func: FunctionWithSeats;
  canEdit: boolean;
  tenantUsers: UserBasic[];
  onUpdateFunction: (id: string, name: string) => void;
  onDeleteFunction: (id: string) => void;
  onAddSeat: (functionId: string, name: string) => void;
  onUpdateSeat: (id: string, name: string) => void;
  onDeleteSeat: (id: string) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssign: (seatId: string, userId: string, type: 'Primary' | 'Secondary') => void;
  onUnassign: (assignmentId: string) => void;
  onSeatClick?: (seatId: string) => void;
}

export function DraggableFunctionColumn({
  func,
  canEdit,
  tenantUsers,
  onUpdateFunction,
  onDeleteFunction,
  onAddSeat,
  onUpdateSeat,
  onDeleteSeat,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssign,
  onUnassign,
  onSeatClick,
}: DraggableFunctionColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(func.name);
  const [isAddingSeat, setIsAddingSeat] = useState(false);
  const [newSeatName, setNewSeatName] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: func.id,
    data: { type: 'function', function: func },
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSaveName = () => {
    if (editName.trim() && editName !== func.name) {
      onUpdateFunction(func.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleAddSeat = () => {
    if (newSeatName.trim()) {
      onAddSeat(func.id, newSeatName.trim());
      setNewSeatName('');
      setIsAddingSeat(false);
    }
  };

  // Count uncovered seats
  const uncoveredSeats = func.seats.filter(s => !s.primaryOwner).length;
  const hasWarnings = uncoveredSeats > 0;
  const seatIds = func.seats.map(s => s.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col w-72 min-w-72 bg-muted/30 rounded-lg border',
        isDragging && 'opacity-50 ring-2 ring-primary',
        hasWarnings && 'border-warning/50'
      )}
    >
      {/* Header */}
      <div className="p-3 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center justify-between gap-2">
          {/* Drag Handle */}
          {canEdit && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}

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

          {/* Warning Badge */}
          {hasWarnings && !isEditing && (
            <Badge variant="outline" className="text-warning border-warning/50 gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {uncoveredSeats}
            </Badge>
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
                  disabled={func.seats.length > 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">
            {func.seats.length} seat{func.seats.length !== 1 ? 's' : ''}
          </p>
          {func.seats.length > 0 && (
            <span className={cn(
              'text-xs',
              uncoveredSeats === 0 ? 'text-emerald-600' : 'text-warning'
            )}>
              • {uncoveredSeats === 0 ? 'All covered' : `${uncoveredSeats} uncovered`}
            </span>
          )}
        </div>
      </div>

      {/* Seats with Sortable Context */}
      <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-[200px]">
        <SortableContext items={seatIds} strategy={verticalListSortingStrategy}>
          {func.seats.map((seat) => (
            <DraggableSeatCard
              key={seat.id}
              seat={seat}
              functionId={func.id}
              canEdit={canEdit}
              tenantUsers={tenantUsers}
              onUpdateSeat={onUpdateSeat}
              onDeleteSeat={onDeleteSeat}
              onAddRole={onAddRole}
              onUpdateRole={onUpdateRole}
              onDeleteRole={onDeleteRole}
              onAssign={onAssign}
              onUnassign={onUnassign}
              onClick={() => onSeatClick?.(seat.id)}
            />
          ))}
        </SortableContext>

        {/* Empty State */}
        {func.seats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No seats yet</p>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setIsAddingSeat(true)}
              >
                <Plus className="h-3 w-3" />
                Add first seat
              </Button>
            )}
          </div>
        )}

        {/* Add seat */}
        {canEdit && func.seats.length > 0 && (
          isAddingSeat ? (
            <div className="p-2 border rounded-lg bg-background">
              <Input
                placeholder="Seat name..."
                value={newSeatName}
                onChange={(e) => setNewSeatName(e.target.value)}
                className="h-8 mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSeat();
                  if (e.key === 'Escape') {
                    setIsAddingSeat(false);
                    setNewSeatName('');
                  }
                }}
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 flex-1" onClick={handleAddSeat}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => {
                    setIsAddingSeat(false);
                    setNewSeatName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full h-8 border-dashed border text-xs gap-1"
              onClick={() => setIsAddingSeat(true)}
            >
              <Plus className="h-3 w-3" />
              Add Seat
            </Button>
          )
        )}
      </div>
    </div>
  );
}
