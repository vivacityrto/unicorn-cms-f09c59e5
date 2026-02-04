import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, Plus, Save, History, CheckCircle, Archive, MoreHorizontal, AlertCircle, Users, Info, LayoutGrid, Network, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAccountabilityChart } from '@/hooks/useAccountabilityChart';
import { SaveVersionDialog, VersionHistoryDialog } from './VersionDialogs';
import { SeatDetailPanel } from './SeatDetailPanel';
import { AccountabilityGaps } from './AccountabilityGaps';
import { OrgChartView } from './OrgChartView';
import { EosChartGrid } from './EosChartGrid';
import { STATUS_COLORS, type ChartStatus, type UserBasic, type SeatWithDetails } from '@/types/accountabilityChart';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { EmptyState } from '@/components/ui/empty-state';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

export function ChartBuilder() {
  const { isFacilitatorMode } = useFacilitatorMode();
  const {
    chart,
    isLoading,
    canEdit: hasEditPermission,
    createChart,
    createChartFromTemplate,
    addFunction,
    updateFunction,
    deleteFunction,
    moveFunction,
    addSeat,
    updateSeat,
    addRole,
    updateRole,
    deleteRole,
    addAssignment,
    removeAssignment,
    saveVersion,
    updateStatus,
  } = useAccountabilityChart();

  // Fetch Vivacity Team users only (EOS is internal-only)
  const { data: vivacityTeamUsers = [], isLoading: isLoadingUsers } = useVivacityTeamUsers();
  
  // Convert to UserBasic format for compatibility
  const tenantUsers: UserBasic[] = useMemo(() => 
    vivacityTeamUsers.map(u => ({
      user_uuid: u.user_uuid,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      avatar_url: u.avatar_url,
    })), 
    [vivacityTeamUsers]
  );

  // Edit is allowed if: has permission AND (Facilitator Mode is ON OR chart is Draft)
  // Once activated, editing requires Facilitator Mode
  const canEdit = hasEditPermission && (isFacilitatorMode || chart?.status === 'Draft' || !chart);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'org' | 'builder'>('org');
  const [selectedSeat, setSelectedSeat] = useState<SeatWithDetails | null>(null);
  const [showSeatDetail, setShowSeatDetail] = useState(false);

  const handleCreateChart = async () => {
    await createChart.mutateAsync();
  };

  const handleCreateFromTemplate = async () => {
    await createChartFromTemplate.mutateAsync();
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
  
  // Calculate seats with too few/many accountabilities
  const seatsWithBadAccountabilityCount = useMemo(() => {
    if (!chart) return { tooFew: 0, tooMany: 0 };
    const allSeats = chart.functions.flatMap(f => f.seats);
    const tooFew = allSeats.filter(s => s.roles.length > 0 && s.roles.length < 3).length;
    const tooMany = allSeats.filter(s => s.roles.length > 7).length;
    return { tooFew, tooMany };
  }, [chart]);

  // Calculate overloaded owners (holding > 3 seats)
  const overloadedOwners = useMemo(() => {
    if (!chart) return [];
    const ownerCounts = new Map<string, number>();
    chart.functions.flatMap(f => f.seats).forEach(seat => {
      if (seat.primaryOwner?.user_uuid) {
        const count = ownerCounts.get(seat.primaryOwner.user_uuid) || 0;
        ownerCounts.set(seat.primaryOwner.user_uuid, count + 1);
      }
    });
    return Array.from(ownerCounts.entries())
      .filter(([_, count]) => count > 3)
      .map(([userId, count]) => {
        const user = tenantUsers.find(u => u.user_uuid === userId);
        return {
          userId,
          name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'Unknown',
          count,
        };
      });
  }, [chart, tenantUsers]);

  // Validation for activation - specifically checks Visionary/Integrator seats
  const canActivate = useMemo(() => {
    if (!chart) return { valid: false, errors: [] as string[] };
    const errors: string[] = [];
    
    const allSeats = chart.functions.flatMap(f => f.seats);
    
    // Check for minimum seats
    if (allSeats.length < 3) {
      errors.push('At least 3 seats are required to activate');
    }
    
    // Find Visionary and Integrator seats
    const visionarySeat = allSeats.find(s => s.eos_role_type === 'visionary');
    const integratorSeat = allSeats.find(s => s.eos_role_type === 'integrator');
    
    // Visionary validation
    if (!visionarySeat) {
      errors.push('A Visionary seat is required');
    } else {
      if (!visionarySeat.primaryOwner) {
        errors.push('Visionary seat must have a primary owner assigned');
      }
      if (visionarySeat.roles.length < 1) {
        errors.push('Visionary seat needs at least 1 accountability');
      }
    }
    
    // Integrator validation
    if (!integratorSeat) {
      errors.push('An Integrator seat is required');
    } else {
      if (!integratorSeat.primaryOwner) {
        errors.push('Integrator seat must have a primary owner assigned');
      }
      if (integratorSeat.roles.length < 1) {
        errors.push('Integrator seat needs at least 1 accountability');
      }
    }
    
    return { valid: errors.length === 0, errors };
  }, [chart]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!chart) {
    const isCreating = createChart.isPending || createChartFromTemplate.isPending;
    
    return (
      <div className="space-y-4">
        <EmptyState
          icon={LayoutGrid}
          title="No Accountability Chart"
          description="Create your Accountability Chart to define Functions, Seats, and Accountabilities. This is not an org chart—it defines how work gets done."
        >
          {hasEditPermission ? (
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Button 
                onClick={handleCreateFromTemplate}
                disabled={isCreating}
              >
                {createChartFromTemplate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Create from EOS Template
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCreateChart}
                disabled={isCreating}
              >
                {createChart.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Start from Scratch
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">
              Contact a Super Admin or Team Leader to create the chart.
            </p>
          )}
        </EmptyState>
      </div>
    );
  }

  const statusColors = STATUS_COLORS[chart.status];

  return (
    <div className="space-y-4">
      {/* Unassigned key seats banner for Draft charts */}
      {chart.status === 'Draft' && !canActivate.valid && (
        <Alert className="bg-warning/10 border-warning/30">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Activation blocked:</strong> Assign owners to {seatsWithoutOwner} unassigned seat{seatsWithoutOwner !== 1 ? 's' : ''} (including Visionary and Integrator) to activate this chart.
          </AlertDescription>
        </Alert>
      )}

      {/* Read-only mode indicator */}
      {chart.status === 'Active' && !isFacilitatorMode && hasEditPermission && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Read-only mode.</strong> Enable Facilitator Mode to edit the active chart.
          </AlertDescription>
        </Alert>
      )}

      {/* Facilitator Mode Guidance */}
      {isFacilitatorMode && (
        <Alert className="bg-primary/5 border-primary/20">
          <Users className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <strong>Facilitator Mode active.</strong> You can add/edit Functions, Seats, and Accountabilities. 
            Each seat should have 3-7 accountabilities and exactly one primary owner.
          </AlertDescription>
        </Alert>
      )}

      {/* Validation Warnings */}
      {(seatsWithoutOwner > 0 || seatsWithBadAccountabilityCount.tooFew > 0 || seatsWithBadAccountabilityCount.tooMany > 0 || overloadedOwners.length > 0) && isFacilitatorMode && (
        <div className="flex flex-wrap gap-2">
          {seatsWithoutOwner > 0 && (
            <Badge variant="outline" className="gap-1 text-warning border-warning/50">
              <AlertCircle className="h-3 w-3" />
              {seatsWithoutOwner} seat{seatsWithoutOwner > 1 ? 's' : ''} without owner
            </Badge>
          )}
          {seatsWithBadAccountabilityCount.tooFew > 0 && (
            <Badge variant="outline" className="gap-1 text-warning border-warning/50">
              <AlertCircle className="h-3 w-3" />
              {seatsWithBadAccountabilityCount.tooFew} seat{seatsWithBadAccountabilityCount.tooFew > 1 ? 's' : ''} with &lt;3 accountabilities
            </Badge>
          )}
          {seatsWithBadAccountabilityCount.tooMany > 0 && (
            <Badge variant="outline" className="gap-1 text-warning border-warning/50">
              <AlertCircle className="h-3 w-3" />
              {seatsWithBadAccountabilityCount.tooMany} seat{seatsWithBadAccountabilityCount.tooMany > 1 ? 's' : ''} with &gt;7 accountabilities
            </Badge>
          )}
          {overloadedOwners.map(owner => (
            <TooltipProvider key={owner.userId}>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-warning border-warning/50">
                    <AlertCircle className="h-3 w-3" />
                    {owner.name} holds {owner.count} seats
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>EOS recommends each person holds at most 3 seats</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      )}

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

          {/* View Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'org' | 'builder')}>
            <TabsList className="h-8">
              <TabsTrigger value="org" className="text-xs px-3">
                <Network className="h-3 w-3 mr-1" />
                Org View
              </TabsTrigger>
              <TabsTrigger value="builder" className="text-xs px-3">
                <LayoutGrid className="h-3 w-3 mr-1" />
                Builder
              </TabsTrigger>
            </TabsList>
          </Tabs>
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

      {/* View Mode Content */}
      {viewMode === 'org' ? (
        <div className="space-y-6">
          <OrgChartView 
            functions={chart.functions} 
            onSeatClick={(seat) => {
              setSelectedSeat(seat);
              setShowSeatDetail(true);
            }} 
          />
          <AccountabilityGaps 
            seats={chart.functions.flatMap(f => f.seats)}
            onSeatClick={(seat) => {
              setSelectedSeat(seat);
              setShowSeatDetail(true);
            }}
          />
        </div>
      ) : (
        <EosChartGrid
          functions={chart.functions}
          canEdit={!!canEdit}
          tenantUsers={tenantUsers}
          isAddingFunction={addFunction.isPending}
          onAddFunction={(name) => addFunction.mutate({ 
            chart_id: chart.id, 
            name,
          })}
          onUpdateFunction={(id, name) => updateFunction.mutate({ id, name })}
          onDeleteFunction={(id) => deleteFunction.mutate(id)}
          onAddRole={(seatId, text) => addRole.mutate({ seat_id: seatId, role_text: text })}
          onUpdateRole={(id, text) => updateRole.mutate({ id, role_text: text })}
          onDeleteRole={(id) => deleteRole.mutate(id)}
          onAssignOwner={(seatId, userId) => 
            addAssignment.mutate({ seat_id: seatId, user_id: userId, assignment_type: 'Primary' })
          }
          onUnassignOwner={(id) => removeAssignment.mutate(id)}
          onCreateSeatForFunction={(functionId) => 
            addSeat.mutate({ 
              function_id: functionId, 
              chart_id: chart.id, 
              seat_name: chart.functions.find(f => f.id === functionId)?.name || 'New Seat' 
            })
          }
          onFunctionClick={(func) => {
            const seat = func.seats[0];
            if (seat) {
              setSelectedSeat(seat);
              setShowSeatDetail(true);
            }
          }}
        />
      )}

      {/* Seat Detail Panel */}
      <SeatDetailPanel
        seat={selectedSeat}
        open={showSeatDetail}
        onOpenChange={setShowSeatDetail}
        canEdit={!!canEdit}
        onUpdate={(seatId, updates) => updateSeat.mutate({ id: seatId, ...updates })}
      />
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
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Accountability Chart?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {!canActivate.valid && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
                    <p className="font-medium text-destructive mb-2">Cannot activate. Fix these issues first:</p>
                    <ul className="text-sm text-destructive/80 list-disc list-inside space-y-1">
                      {canActivate.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {canActivate.errors.length > 5 && (
                        <li>...and {canActivate.errors.length - 5} more issues</li>
                      )}
                    </ul>
                  </div>
                )}
                <p>
                  Activating will make this chart the official reference for Quarterly Conversations
                  and EOS Health scoring. Only one chart can be active at a time.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleActivate}
              disabled={!canActivate.valid}
              className={!canActivate.valid ? 'opacity-50 cursor-not-allowed' : ''}
            >
              Activate Chart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
