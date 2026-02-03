import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Plus, Save, CheckCircle, BarChart3, Settings, AlertCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSeatScorecard } from '@/hooks/useSeatScorecard';
import { MeasurableRow } from './MeasurableRow';
import { WeeklyEntryGrid } from './WeeklyEntryGrid';
import { STATUS_COLORS, COMPARISON_LABELS, type ComparisonType, type ScorecardStatus } from '@/types/seatScorecard';

interface SeatScorecardBuilderProps {
  seatId: string;
  seatName: string;
  functionName?: string;
  onClose?: () => void;
}

export function SeatScorecardBuilder({
  seatId,
  seatName,
  functionName,
  onClose,
}: SeatScorecardBuilderProps) {
  const {
    scorecard,
    isLoading,
    canEdit,
    canEnterData,
    createScorecard,
    addMeasurable,
    updateMeasurable,
    deleteMeasurable,
    addEntry,
    saveVersion,
    updateStatus,
  } = useSeatScorecard(seatId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  // New measurable form
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newComparison, setNewComparison] = useState<ComparisonType>('>=');
  const [newUnit, setNewUnit] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  const handleCreateScorecard = async () => {
    await createScorecard.mutateAsync();
  };

  const handleAddMeasurable = () => {
    if (newName.trim() && newTarget && scorecard) {
      addMeasurable.mutate({
        seat_scorecard_id: scorecard.id,
        name: newName.trim(),
        target_value: parseFloat(newTarget),
        comparison_type: newComparison,
        unit: newUnit.trim() || undefined,
      });
      setNewName('');
      setNewTarget('');
      setNewComparison('>=');
      setNewUnit('');
      setShowAddDialog(false);
    }
  };

  const handleSaveVersion = () => {
    if (changeSummary.trim() && scorecard) {
      saveVersion.mutate(
        { seat_scorecard_id: scorecard.id, change_summary: changeSummary.trim() },
        { onSuccess: () => {
          setShowSaveDialog(false);
          setChangeSummary('');
        }}
      );
    }
  };

  const handleActivate = () => {
    if (scorecard) {
      updateStatus.mutate(
        { scorecardId: scorecard.id, status: 'Active' },
        { onSuccess: () => setShowActivateDialog(false) }
      );
    }
  };

  const handleChangeStatus = (status: ScorecardStatus) => {
    if (scorecard) {
      updateStatus.mutate({ scorecardId: scorecard.id, status });
    }
  };

  const getInitials = (user?: { first_name?: string; last_name?: string }) => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getUserName = (user?: { first_name?: string; last_name?: string; email?: string }) => {
    if (!user) return 'Unassigned';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scorecard) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Scorecard</h3>
          <p className="text-muted-foreground mb-4">
            Create a scorecard for this seat to track weekly measurables.
          </p>
          {canEdit && (
            <Button onClick={handleCreateScorecard} disabled={createScorecard.isPending}>
              {createScorecard.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Scorecard
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const statusColors = STATUS_COLORS[scorecard.status];
  const activeMeasurables = scorecard.measurables.filter(m => m.is_active);
  const measurableCount = activeMeasurables.length;
  const isInRange = measurableCount >= 3 && measurableCount <= 7;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-bold">{seatName} Scorecard</h2>
            <Badge className={cn(statusColors.bg, statusColors.text, statusColors.border, 'border')}>
              {scorecard.status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {functionName && <span>Function: {functionName}</span>}
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {getUserName(scorecard.seat?.primaryOwner)}
            </span>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save className="h-4 w-4 mr-1" />
              Save Version
            </Button>
            
            {scorecard.status === 'Draft' && (
              <Button size="sm" onClick={() => setShowActivateDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Activate
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Warning if not in range */}
      {!isInRange && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span>
                {measurableCount < 3 
                  ? `Add ${3 - measurableCount} more measurable${3 - measurableCount > 1 ? 's' : ''} (recommended: 3-7)`
                  : `Consider reducing to 7 or fewer measurables for focus`
                }
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="entries" className="w-full">
        <TabsList>
          <TabsTrigger value="entries" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            Weekly Entries
          </TabsTrigger>
          <TabsTrigger value="setup" className="gap-1">
            <Settings className="h-4 w-4" />
            Setup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-4 mt-4">
          {activeMeasurables.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No active measurables. Add some in the Setup tab.</p>
              </CardContent>
            </Card>
          ) : (
            activeMeasurables.map(measurable => (
              <WeeklyEntryGrid
                key={measurable.id}
                measurable={measurable}
                canEnter={!!canEnterData}
                onAddEntry={(measurableId, weekStartDate, value, notes) => {
                  addEntry.mutate({
                    seat_measurable_id: measurableId,
                    week_start_date: weekStartDate,
                    actual_value: value,
                    notes,
                  });
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="setup" className="space-y-4 mt-4">
          {/* Measurables List */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Measurables</CardTitle>
                {canEdit && (
                  <Button size="sm" onClick={() => setShowAddDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Measurable
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {scorecard.measurables.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No measurables defined yet.
                </p>
              ) : (
                scorecard.measurables.map(measurable => (
                  <MeasurableRow
                    key={measurable.id}
                    measurable={measurable}
                    canEdit={!!canEdit}
                    onUpdate={(id, updates) => updateMeasurable.mutate({ id, ...updates })}
                    onDelete={(id) => deleteMeasurable.mutate(id)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Version History */}
          {scorecard.versions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Version History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {scorecard.versions.slice(0, 5).map(version => (
                    <div key={version.id} className="flex items-center justify-between text-sm">
                      <span>v{version.version_number}: {version.change_summary}</span>
                      <span className="text-muted-foreground">
                        {new Date(version.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Measurable Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Measurable</DialogTitle>
            <DialogDescription>
              Define a new weekly measurable for this seat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Sales calls completed"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Comparison</Label>
                <Select value={newComparison} onValueChange={(v) => setNewComparison(v as ComparisonType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">=">{COMPARISON_LABELS['>=']}</SelectItem>
                    <SelectItem value="<=">{COMPARISON_LABELS['<=']}</SelectItem>
                    <SelectItem value="=">{COMPARISON_LABELS['=']}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target *</Label>
                <Input
                  type="number"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="10"
                />
              </div>

              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="%"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMeasurable} disabled={!newName.trim() || !newTarget}>
              Add Measurable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Version Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Version</DialogTitle>
            <DialogDescription>
              Create a snapshot of the current scorecard configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>Change Summary *</Label>
            <Textarea
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="Describe what changed..."
              className="mt-2"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVersion} disabled={!changeSummary.trim() || saveVersion.isPending}>
              {saveVersion.isPending ? 'Saving...' : 'Save Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Dialog */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Scorecard?</AlertDialogTitle>
            <AlertDialogDescription>
              {measurableCount < 3 && (
                <>
                  <span className="text-destructive font-medium">
                    Warning: This scorecard has fewer than 3 measurables.
                  </span>
                  <br /><br />
                </>
              )}
              Activating will enable weekly entry tracking and include this scorecard in EOS Health scoring.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
