import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, Edit2, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeatCard } from './SeatCard';
import type { FunctionWithSeats, UserBasic } from '@/types/accountabilityChart';

interface FunctionColumnProps {
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
}

export function FunctionColumn({
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
}: FunctionColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(func.name);
  const [isAddingSeat, setIsAddingSeat] = useState(false);
  const [newSeatName, setNewSeatName] = useState('');

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

  return (
    <div className="flex flex-col w-64 min-w-64 bg-muted/30 rounded-lg">
      {/* Header */}
      <div className="p-3 border-b bg-muted/50 rounded-t-lg">
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
            <h3 className="font-semibold">{func.name}</h3>
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
        <p className="text-xs text-muted-foreground mt-1">
          {func.seats.length} seat{func.seats.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Seats */}
      <div className="p-2 space-y-2 flex-1 overflow-y-auto">
        {func.seats.map((seat) => (
          <SeatCard
            key={seat.id}
            seat={seat}
            canEdit={canEdit}
            tenantUsers={tenantUsers}
            onUpdateSeat={onUpdateSeat}
            onDeleteSeat={onDeleteSeat}
            onAddRole={onAddRole}
            onUpdateRole={onUpdateRole}
            onDeleteRole={onDeleteRole}
            onAssign={onAssign}
            onUnassign={onUnassign}
          />
        ))}

        {/* Add seat */}
        {canEdit && (
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
