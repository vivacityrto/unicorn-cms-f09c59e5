import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Loader2 } from 'lucide-react';
import { EosFunctionCard } from './EosFunctionCard';
import type { FunctionWithSeats, UserBasic } from '@/types/accountabilityChart';

interface EosChartGridProps {
  functions: FunctionWithSeats[];
  canEdit: boolean;
  tenantUsers: UserBasic[];
  isAddingFunction: boolean;
  onAddFunction: (name: string) => void;
  onUpdateFunction: (id: string, name: string) => void;
  onDeleteFunction: (id: string) => void;
  onAddRole: (seatId: string, text: string) => void;
  onUpdateRole: (id: string, text: string) => void;
  onDeleteRole: (id: string) => void;
  onAssignOwner: (seatId: string, userId: string) => void;
  onUnassignOwner: (assignmentId: string) => void;
  onCreateSeatForFunction: (functionId: string) => void;
  onFunctionClick?: (func: FunctionWithSeats) => void;
}

/**
 * EOS Chart Grid
 * 
 * Displays the Accountability Chart in the standard EOS format:
 * - Functions as cards in a responsive grid
 * - Each function shows: Name, Owner, Roles
 * - Functional Leads show Team Members section (people reporting to the lead)
 */
export function EosChartGrid({
  functions,
  canEdit,
  tenantUsers,
  isAddingFunction,
  onAddFunction,
  onUpdateFunction,
  onDeleteFunction,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
  onAssignOwner,
  onUnassignOwner,
  onCreateSeatForFunction,
  onFunctionClick,
}: EosChartGridProps) {
  const [newFunctionName, setNewFunctionName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Group functions by type for organization
  const leadershipFunctions = functions.filter(f => 
    f.function_type === 'leadership' || 
    f.seats.some(s => s.eos_role_type === 'visionary' || s.eos_role_type === 'integrator')
  );
  const otherFunctions = functions.filter(f => 
    !leadershipFunctions.includes(f)
  );

  const handleAddFunction = () => {
    if (newFunctionName.trim()) {
      onAddFunction(newFunctionName.trim());
      setNewFunctionName('');
      setShowAddForm(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Leadership Team Row */}
      {leadershipFunctions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wide">
            Leadership Team
          </h3>
          <div className="flex flex-wrap gap-4">
            {leadershipFunctions.map(func => (
              <EosFunctionCard
                key={func.id}
                func={func}
                canEdit={canEdit}
                tenantUsers={tenantUsers}
                onUpdateFunction={onUpdateFunction}
                onDeleteFunction={onDeleteFunction}
                onAddRole={onAddRole}
                onUpdateRole={onUpdateRole}
                onDeleteRole={onDeleteRole}
                onAssignOwner={onAssignOwner}
                onUnassignOwner={onUnassignOwner}
                onCreateSeatForFunction={onCreateSeatForFunction}
                onClick={() => onFunctionClick?.(func)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Functions Row */}
      {otherFunctions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wide">
            Functions
          </h3>
          <div className="flex flex-wrap gap-4">
            {otherFunctions.map(func => (
              <EosFunctionCard
                key={func.id}
                func={func}
                canEdit={canEdit}
                tenantUsers={tenantUsers}
                onUpdateFunction={onUpdateFunction}
                onDeleteFunction={onDeleteFunction}
                onAddRole={onAddRole}
                onUpdateRole={onUpdateRole}
                onDeleteRole={onDeleteRole}
                onAssignOwner={onAssignOwner}
                onUnassignOwner={onUnassignOwner}
                onCreateSeatForFunction={onCreateSeatForFunction}
                onClick={() => onFunctionClick?.(func)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {functions.length === 0 && !showAddForm && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No functions defined yet</p>
          {canEdit && (
            <Button onClick={() => setShowAddForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add First Function
            </Button>
          )}
        </div>
      )}

      {/* Add Function Button/Form */}
      {canEdit && functions.length > 0 && (
        <div className="pt-4">
          {showAddForm ? (
            <div className="inline-flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
              <Input
                placeholder="Function name..."
                value={newFunctionName}
                onChange={(e) => setNewFunctionName(e.target.value)}
                className="h-9 w-64"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFunction();
                  if (e.key === 'Escape') {
                    setShowAddForm(false);
                    setNewFunctionName('');
                  }
                }}
              />
              <Button 
                size="sm" 
                onClick={handleAddFunction}
                disabled={!newFunctionName.trim() || isAddingFunction}
              >
                {isAddingFunction ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Add'
                )}
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewFunctionName('');
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4" />
              Add Function
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
