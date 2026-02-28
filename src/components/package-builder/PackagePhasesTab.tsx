import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, ChevronDown, ChevronRight, Trash2, Lock, AlertTriangle,
  Layers, GripVertical, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { usePackagePhases } from '@/hooks/usePackagePhases';
import { GATE_TYPE_OPTIONS, type Phase } from '@/types/checkpoint-phase';

interface PackagePhasesTabProps {
  packageId: number;
  /** Stage IDs currently in the package (from package_stages) */
  packageStageIds: number[];
  /** Stage metadata lookup */
  stageMap: Map<number, { id: number; title: string; stage_type?: string }>;
}

export function PackagePhasesTab({ packageId, packageStageIds, stageMap }: PackagePhasesTabProps) {
  const {
    allPhases,
    assignedPhases,
    phaseStages,
    loading,
    createPhase,
    updatePhase,
    assignStageToPhase,
    removeStageFromPhase,
    getStagesForPhase,
  } = usePackagePhases(packageId);

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState<string | null>(null);
  const [newPhase, setNewPhase] = useState({ phase_key: '', title: '', description: '', gate_type: 'none', allow_parallel: false });

  const togglePhaseExpanded = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
      return next;
    });
  };

  const handleCreatePhase = async () => {
    if (!newPhase.phase_key || !newPhase.title) {
      toast.error('Phase key and title are required');
      return;
    }
    try {
      await createPhase.mutateAsync({
        phase_key: newPhase.phase_key,
        title: newPhase.title,
        description: newPhase.description || undefined,
        gate_type: newPhase.gate_type,
        allow_parallel: newPhase.allow_parallel,
      });
      toast.success('Phase created');
      setShowCreateDialog(false);
      setNewPhase({ phase_key: '', title: '', description: '', gate_type: 'none', allow_parallel: false });
    } catch (e: any) {
      toast.error(e.message || 'Failed to create phase');
    }
  };

  const handleAssignStage = async (phaseId: string, stageId: number) => {
    try {
      const existingStages = getStagesForPhase(phaseId);
      await assignStageToPhase.mutateAsync({
        phaseId,
        stageId,
        sortOrder: existingStages.length,
      });
      toast.success('Stage assigned to phase');
    } catch (e: any) {
      if (e.message?.includes('duplicate')) {
        toast.error('Stage already assigned to this phase');
      } else {
        toast.error(e.message || 'Failed to assign stage');
      }
    }
  };

  const handleRemoveStage = async (phaseStageId: string) => {
    try {
      await removeStageFromPhase.mutateAsync(phaseStageId);
      toast.success('Stage removed from phase');
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove stage');
    }
  };

  // Stages assigned to any phase for this package
  const assignedStageIds = new Set(phaseStages.map(ps => ps.stage_id));
  const unassignedStageIds = packageStageIds.filter(id => !assignedStageIds.has(id));

  // Available phases not yet used in this package
  const unusedPhases = allPhases.filter(p => !assignedPhases.some(ap => ap.id === p.id));

  const getGateIcon = (gateType: string) => {
    if (gateType === 'hard') return <Lock className="h-3.5 w-3.5 text-destructive" />;
    if (gateType === 'soft') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    return <Shield className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getGateLabel = (gateType: string) => {
    return GATE_TYPE_OPTIONS.find(o => o.value === gateType)?.label || gateType;
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading phases…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Checkpoint Phases
              </CardTitle>
              <CardDescription>
                Group stages into phases with optional gating. Stages not assigned to any phase remain ungrouped.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {unusedPhases.length > 0 && (
                <Select onValueChange={(phaseId) => {
                  // When selecting an existing phase, expand it
                  setExpandedPhases(prev => new Set(prev).add(phaseId));
                  // If it has no stages yet for this package, that's fine — user can assign
                  toast.info('Phase added. Assign stages below.');
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Add existing phase…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unusedPhases.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} ({p.phase_key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Phase
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Assigned Phases */}
      {assignedPhases.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">No phases configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a phase and assign stages to enable checkpoint-based progression.
            </p>
          </CardContent>
        </Card>
      )}

      {assignedPhases.map(phase => {
        const stages = getStagesForPhase(phase.id);
        const isExpanded = expandedPhases.has(phase.id);

        return (
          <Collapsible key={phase.id} open={isExpanded} onOpenChange={() => togglePhaseExpanded(phase.id)}>
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">{phase.title}</span>
                      <Badge variant="outline" className="text-xs">{phase.phase_key}</Badge>
                      <div className="flex items-center gap-1">
                        {getGateIcon(phase.gate_type)}
                        <span className="text-xs text-muted-foreground">{getGateLabel(phase.gate_type)}</span>
                      </div>
                      {phase.allow_parallel && (
                        <Badge variant="secondary" className="text-xs">Parallel</Badge>
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {stages.length} stage{stages.length !== 1 ? 's' : ''}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setShowAssignDialog(phase.id); }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Assign Stage
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <Separator />
                <CardContent className="pt-3">
                  {phase.description && (
                    <p className="text-sm text-muted-foreground mb-3">{phase.description}</p>
                  )}
                  {stages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No stages assigned yet. Click "Assign Stage" to add stages to this phase.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {stages.map((ps, idx) => {
                        const meta = stageMap.get(ps.stage_id);
                        return (
                          <div key={ps.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30 group">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                            <span className="text-sm font-medium flex-1 truncate">
                              {meta?.title || `Stage #${ps.stage_id}`}
                            </span>
                            <Badge variant={ps.is_required ? 'default' : 'secondary'} className="text-xs">
                              {ps.is_required ? 'Required' : 'Optional'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={() => handleRemoveStage(ps.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Unassigned stages info */}
      {unassignedStageIds.length > 0 && assignedPhases.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              <strong>{unassignedStageIds.length}</strong> stage{unassignedStageIds.length !== 1 ? 's' : ''} not assigned to any phase
              — they will display as ungrouped in the runtime view.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Phase Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Phase</DialogTitle>
            <DialogDescription>Define a reusable phase template that can be used across packages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phase Key</Label>
                <Input
                  value={newPhase.phase_key}
                  onChange={(e) => setNewPhase(p => ({ ...p, phase_key: e.target.value.toUpperCase() }))}
                  placeholder="e.g., KS-ONBOARD"
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newPhase.title}
                  onChange={(e) => setNewPhase(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Onboarding"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newPhase.description}
                onChange={(e) => setNewPhase(p => ({ ...p, description: e.target.value }))}
                placeholder="Purpose of this phase…"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gate Type</Label>
                <Select value={newPhase.gate_type} onValueChange={(v) => setNewPhase(p => ({ ...p, gate_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GATE_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <div>
                          <span className="font-medium">{o.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{o.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Allow Parallel</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={newPhase.allow_parallel}
                    onCheckedChange={(v) => setNewPhase(p => ({ ...p, allow_parallel: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {newPhase.allow_parallel ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreatePhase} disabled={createPhase.isPending}>
              {createPhase.isPending ? 'Creating…' : 'Create Phase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Stage Dialog */}
      <Dialog open={!!showAssignDialog} onOpenChange={(open) => !open && setShowAssignDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Stage to Phase</DialogTitle>
            <DialogDescription>
              Select a stage from this package to assign to the phase.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {packageStageIds.map(stageId => {
                const meta = stageMap.get(stageId);
                const alreadyAssigned = showAssignDialog
                  ? phaseStages.some(ps => ps.phase_id === showAssignDialog && ps.stage_id === stageId)
                  : false;

                return (
                  <div
                    key={stageId}
                    className={`flex items-center justify-between p-2 rounded border ${alreadyAssigned ? 'opacity-50' : 'hover:bg-muted/50 cursor-pointer'}`}
                    onClick={() => {
                      if (!alreadyAssigned && showAssignDialog) {
                        handleAssignStage(showAssignDialog, stageId);
                      }
                    }}
                  >
                    <span className="text-sm font-medium">{meta?.title || `Stage #${stageId}`}</span>
                    {alreadyAssigned && <Badge variant="secondary" className="text-xs">Assigned</Badge>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
