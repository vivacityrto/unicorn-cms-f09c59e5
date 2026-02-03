import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, Save, History, CheckCircle, Archive, MoreHorizontal, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccountabilityChart } from '@/hooks/useAccountabilityChart';
import { FunctionColumn } from './FunctionColumn';
import { SaveVersionDialog, VersionHistoryDialog } from './VersionDialogs';
import { STATUS_COLORS, type ChartStatus, type UserBasic } from '@/types/accountabilityChart';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function ChartBuilder() {
  const { profile } = useAuth();
  const {
    chart,
    isLoading,
    canEdit,
    createChart,
    addFunction,
    updateFunction,
    deleteFunction,
    addSeat,
    updateSeat,
    deleteSeat,
    addRole,
    updateRole,
    deleteRole,
    addAssignment,
    removeAssignment,
    saveVersion,
    updateStatus,
  } = useAccountabilityChart();

  const [tenantUsers, setTenantUsers] = useState<UserBasic[]>([]);
  const [isAddingFunction, setIsAddingFunction] = useState(false);
  const [newFunctionName, setNewFunctionName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  // Fetch tenant users
  useEffect(() => {
    if (profile?.tenant_id) {
      supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url')
        .eq('tenant_id', profile.tenant_id)
        .then(({ data }) => {
          setTenantUsers((data || []) as UserBasic[]);
        });
    }
  }, [profile?.tenant_id]);

  const handleCreateChart = async () => {
    await createChart.mutateAsync();
  };

  const handleAddFunction = () => {
    if (newFunctionName.trim() && chart) {
      addFunction.mutate({
        chart_id: chart.id,
        name: newFunctionName.trim(),
      });
      setNewFunctionName('');
      setIsAddingFunction(false);
    }
  };

  const handleSaveVersion = (changeSummary: string) => {
    if (chart) {
      saveVersion.mutate(
        { chart_id: chart.id, change_summary: changeSummary },
        { onSuccess: () => setShowSaveDialog(false) }
      );
    }
  };

  const handleActivate = () => {
    if (chart) {
      updateStatus.mutate(
        { chartId: chart.id, status: 'Active' },
        { onSuccess: () => setShowActivateDialog(false) }
      );
    }
  };

  const handleChangeStatus = (status: ChartStatus) => {
    if (chart) {
      updateStatus.mutate({ chartId: chart.id, status });
    }
  };

  // Calculate chart health warnings
  const seatsWithoutOwner = chart?.functions.flatMap(f => f.seats).filter(s => !s.primaryOwner).length || 0;
  const totalSeats = chart?.functions.flatMap(f => f.seats).length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">No Accountability Chart</h3>
        <p className="text-muted-foreground mb-4">
          Create your first Accountability Chart to define roles and responsibilities.
        </p>
        {canEdit && (
          <Button onClick={handleCreateChart} disabled={createChart.isPending}>
            {createChart.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Accountability Chart
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  const statusColors = STATUS_COLORS[chart.status];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge className={cn(statusColors.bg, statusColors.text, statusColors.border, 'border')}>
            {chart.status}
          </Badge>

          {chart.versions.length > 0 && (
            <span className="text-sm text-muted-foreground">
              v{chart.versions[0].version_number}
            </span>
          )}

          {seatsWithoutOwner > 0 && (
            <Badge variant="outline" className="gap-1 text-warning border-warning/50">
              <AlertCircle className="h-3 w-3" />
              {seatsWithoutOwner} seat{seatsWithoutOwner > 1 ? 's' : ''} without owner
            </Badge>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryDialog(true)}
            >
              <History className="h-4 w-4 mr-1" />
              History
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
            >
              <Save className="h-4 w-4 mr-1" />
              Save Version
            </Button>

            {chart.status === 'Draft' && (
              <Button
                size="sm"
                onClick={() => setShowActivateDialog(true)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Activate
              </Button>
            )}

            {chart.status !== 'Draft' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {chart.status === 'Active' && (
                    <DropdownMenuItem onClick={() => handleChangeStatus('Archived')}>
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  {chart.status === 'Archived' && (
                    <DropdownMenuItem onClick={() => handleChangeStatus('Draft')}>
                      Restore to Draft
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Chart grid */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {chart.functions.map((func) => (
          <FunctionColumn
            key={func.id}
            func={func}
            canEdit={!!canEdit}
            tenantUsers={tenantUsers}
            onUpdateFunction={(id, name) => updateFunction.mutate({ id, name })}
            onDeleteFunction={(id) => deleteFunction.mutate(id)}
            onAddSeat={(functionId, name) =>
              addSeat.mutate({ function_id: functionId, chart_id: chart.id, seat_name: name })
            }
            onUpdateSeat={(id, name) => updateSeat.mutate({ id, seat_name: name })}
            onDeleteSeat={(id) => deleteSeat.mutate(id)}
            onAddRole={(seatId, text) => addRole.mutate({ seat_id: seatId, role_text: text })}
            onUpdateRole={(id, text) => updateRole.mutate({ id, role_text: text })}
            onDeleteRole={(id) => deleteRole.mutate(id)}
            onAssign={(seatId, userId, type) =>
              addAssignment.mutate({ seat_id: seatId, user_id: userId, assignment_type: type })
            }
            onUnassign={(id) => removeAssignment.mutate(id)}
          />
        ))}

        {/* Add function */}
        {canEdit && (
          isAddingFunction ? (
            <div className="w-64 min-w-64 p-3 border-2 border-dashed rounded-lg bg-muted/30">
              <Input
                placeholder="Function name..."
                value={newFunctionName}
                onChange={(e) => setNewFunctionName(e.target.value)}
                className="mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFunction();
                  if (e.key === 'Escape') {
                    setIsAddingFunction(false);
                    setNewFunctionName('');
                  }
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={handleAddFunction}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAddingFunction(false);
                    setNewFunctionName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-64 min-w-64 h-24 border-2 border-dashed flex-col gap-2"
              onClick={() => setIsAddingFunction(true)}
            >
              <Plus className="h-5 w-5" />
              Add Function
            </Button>
          )
        )}
      </div>

      {/* Dialogs */}
      <SaveVersionDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveVersion}
        isPending={saveVersion.isPending}
      />

      <VersionHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        versions={chart.versions}
        onViewVersion={(version) => {
          // TODO: Implement version preview
          console.log('View version:', version);
        }}
        onRestoreVersion={(version) => {
          // TODO: Implement restore
          console.log('Restore version:', version);
        }}
      />

      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Accountability Chart?</AlertDialogTitle>
            <AlertDialogDescription>
              {seatsWithoutOwner > 0 ? (
                <>
                  <span className="text-destructive">
                    Warning: {seatsWithoutOwner} seat{seatsWithoutOwner > 1 ? 's' : ''} still need a primary owner.
                  </span>
                  <br /><br />
                </>
              ) : null}
              Activating will make this chart the official reference for Quarterly Conversations
              and EOS Health scoring. Only one chart can be active at a time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>
              Activate Chart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
