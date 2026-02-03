import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Loader2, ChevronDown } from 'lucide-react';
import { EosFunctionCard } from './EosFunctionCard';
import type { FunctionWithSeats, UserBasic } from '@/types/accountabilityChart';

interface EosChartGridProps {
  functions: FunctionWithSeats[];
  canEdit: boolean;
  tenantUsers: UserBasic[];
  isAddingFunction: boolean;
  onAddFunction: (name: string, parentId?: string) => void;
  onUpdateFunction: (id: string, name: string) => void;
  onDeleteFunction: (id: string) => void;
  onMoveFunction?: (functionId: string, newParentId: string | null, newIndex: number) => void;
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
 * - Functional Leads can have nested sub-functions
 */
export function EosChartGrid({
  functions,
  canEdit,
  tenantUsers,
  isAddingFunction,
  onAddFunction,
  onUpdateFunction,
  onDeleteFunction,
  onMoveFunction,
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
  const [addUnderLead, setAddUnderLead] = useState<string | null>(null);

  // Build parent-child relationships
  const { topLevelFunctions, childrenByParent, functionalLeads } = useMemo(() => {
    // Top-level = no parent_function_id
    const topLevel = functions.filter(f => !f.parent_function_id);
    
    // Group children by parent
    const childrenMap = new Map<string, FunctionWithSeats[]>();
    functions.filter(f => f.parent_function_id).forEach(f => {
      const existing = childrenMap.get(f.parent_function_id!) || [];
      childrenMap.set(f.parent_function_id!, [...existing, f]);
    });

    // Leads = top-level functions with eos_role_type = 'functional_lead'
    const leads = topLevel.filter(f => 
      f.seats.some(s => s.eos_role_type === 'functional_lead')
    );

    return {
      topLevelFunctions: topLevel,
      childrenByParent: childrenMap,
      functionalLeads: leads,
    };
  }, [functions]);

  // Group functions by type for organization
  const leadershipFunctions = topLevelFunctions.filter(f => 
    f.function_type === 'leadership' || 
    f.seats.some(s => s.eos_role_type === 'visionary' || s.eos_role_type === 'integrator')
  );
  const otherFunctions = topLevelFunctions.filter(f => 
    !leadershipFunctions.includes(f)
  );

  const handleAddFunction = () => {
    if (newFunctionName.trim()) {
      onAddFunction(newFunctionName.trim(), addUnderLead ?? undefined);
      setNewFunctionName('');
      setShowAddForm(false);
      setAddUnderLead(null);
    }
  };

  const handleAddSubFunction = (parentId: string, name: string) => {
    onAddFunction(name, parentId);
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
                childFunctions={childrenByParent.get(func.id) || []}
                allLeads={functionalLeads}
                onUpdateFunction={onUpdateFunction}
                onDeleteFunction={onDeleteFunction}
                onAddSubFunction={handleAddSubFunction}
                onMoveFunction={onMoveFunction}
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
                childFunctions={childrenByParent.get(func.id) || []}
                allLeads={functionalLeads}
                onUpdateFunction={onUpdateFunction}
                onDeleteFunction={onDeleteFunction}
                onAddSubFunction={handleAddSubFunction}
                onMoveFunction={onMoveFunction}
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
                    setAddUnderLead(null);
                  }
                }}
              />
              {/* Lead selector if leads exist */}
              {functionalLeads.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 h-9">
                      {addUnderLead 
                        ? `Under: ${functionalLeads.find(l => l.id === addUnderLead)?.name?.slice(0, 15)}...`
                        : 'Top-level'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setAddUnderLead(null)}>
                      Top-level function
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {functionalLeads.map(lead => (
                      <DropdownMenuItem key={lead.id} onClick={() => setAddUnderLead(lead.id)}>
                        Under: {lead.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
                  setAddUnderLead(null);
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
