import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { StageStaffTasks } from './StageStaffTasks';
import { StageDetailSection } from './StageDetailSection';
import { StageDocumentsSection } from './StageDocumentsSection';
import { StageEmailsSection } from './StageEmailsSection';
import { StageNotesSection } from './StageNotesSection';
import { LegacyDataDiagnostics } from './LegacyDataDiagnostics';
import { PhaseGroupHeader } from './PhaseGroupHeader';
import { useCheckpointPhasesEnabled } from '@/hooks/useCheckpointPhasesEnabled';
import { usePhaseProgress } from '@/hooks/usePhaseProgress';
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Clock, 
  Loader2,
  ChevronDown,
  ChevronRight,
  ListTodo,
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageInstance {
  id: number;
  stage_id: number;
  stage_name: string;
  shortname: string | null;
  status: string | number;
  status_date: string | null;
  completion_date: string | null;
  comment: string | null;
  paid: boolean;
  released_client_tasks: boolean;
  is_recurring: boolean;
}

interface PackageStagesManagerProps {
  tenantId: number;
  packageId: number;
  packageName: string;
}

// Legacy status mapping (unicorn1 uses integers)
const STATUS_MAP: Record<number, string> = {
  0: 'not_started',
  1: 'in_progress',
  2: 'blocked',
  3: 'complete',
};

const STATUS_OPTIONS = [
  { value: 0, label: 'Not Started', icon: Circle, color: 'text-muted-foreground' },
  { value: 1, label: 'In Progress', icon: Clock, color: 'text-blue-600' },
  { value: 2, label: 'Blocked', icon: AlertCircle, color: 'text-red-600' },
  { value: 3, label: 'Complete', icon: CheckCircle2, color: 'text-green-600' },
];

export function PackageStagesManager({ tenantId, packageId, packageName }: PackageStagesManagerProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [stages, setStages] = useState<StageInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [packageInstanceId, setPackageInstanceId] = useState<number | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [recurringConfirm, setRecurringConfirm] = useState<StageInstance | null>(null);

  const { enabled: phasesEnabled } = useCheckpointPhasesEnabled();
  const { phases: phaseProgress } = usePhaseProgress(packageInstanceId);

  const toggleRecurring = async (stage: StageInstance) => {
    const newValue = !stage.is_recurring;
    try {
      // Update stage_instances
      await supabase
        .from('stage_instances')
        .update({ is_recurring: newValue })
        .eq('id', stage.id);

      // Audit log
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'stage_recurring_toggled',
        entity_type: 'stage_instances',
        entity_id: stage.id.toString(),
        before_data: { is_recurring: stage.is_recurring },
        after_data: { is_recurring: newValue },
        details: { stage_name: stage.stage_name, package_id: packageId }
      });

      toast({ title: 'Updated', description: `${stage.stage_name} set to ${newValue ? 'Recurring' : 'Once'}` });
      fetchStages();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRecurringConfirm(null);
    }
  };

  const toggleStageExpanded = (stageId: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchStages();
  }, [tenantId, packageId]);

  const fetchStages = async () => {
    setLoading(true);
    try {
      // First, find the package_instance for this tenant + package
      const { data: instanceData, error: instanceError } = await supabase
        .from('package_instances')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('package_id', packageId)
        .eq('is_complete', false)
        .limit(1)
        .maybeSingle();

      if (instanceError) throw instanceError;

      if (!instanceData) {
        setStages([]);
        setLoading(false);
        return;
      }

      setPackageInstanceId(instanceData.id);

      // Fetch stage_instances for this package_instance
      const stageResult = await (supabase
        .from('stage_instances' as any)
        .select('id, stage_id, status, status_date, completion_date, comment, paid, released_client_tasks, is_recurring')
        .eq('packageinstance_id', instanceData.id)
        .order('stage_sortorder')) as { data: Array<{ id: number; stage_id: number; status: string | null; completion_date: string | null; paid: boolean | null; released_client_tasks: boolean | null }> | null; error: any };
      
      const stageData = stageResult.data;
      const stageError = stageResult.error;

      if (stageError) throw stageError;

      if (!stageData || stageData.length === 0) {
        setStages([]);
        setLoading(false);
        return;
      }

      // Get unique stage IDs and fetch stage metadata from public.stages
      const stageIds = [...new Set(stageData.map(s => s.stage_id))] as number[];
      const { data: stagesMetadata, error: metaError } = await supabase
        .from('stages')
        .select('id, name, shortname')
        .in('id', stageIds);

      if (metaError) throw metaError;

      // Create a lookup map for stage metadata
      const stageMap = new Map(stagesMetadata?.map(s => [s.id, s]) || []);

      // Transform the data
      const transformed: StageInstance[] = stageData.map((row: any) => {
        const meta = stageMap.get(row.stage_id);
        return {
          id: row.id,
          stage_id: row.stage_id,
          stage_name: meta?.name || `Stage ${row.stage_id}`,
          shortname: meta?.shortname || null,
          status: row.status ?? 0,
          status_date: row.status_date || null,
          completion_date: row.completion_date,
          comment: row.comment || null,
          paid: row.paid ?? false,
          released_client_tasks: row.released_client_tasks ?? false,
          is_recurring: row.is_recurring ?? false,
        };
      });

      setStages(transformed);
    } catch (error: any) {
      console.error('Error fetching stage instances:', error);
      toast({ title: 'Error', description: 'Failed to load stages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateStageStatus = async (stageInstanceId: number, newStatus: number) => {
    setUpdating(stageInstanceId);
    
    try {
      const oldStage = stages.find(s => s.id === stageInstanceId);
      const oldStatus = oldStage?.status;

      // Build update object - always update status_date when status changes
      const updateData: Record<string, any> = {
        status: newStatus,
        status_date: new Date().toISOString(),
      };

      // Set completion_date if completing
      if (newStatus === 3 && oldStatus !== 3) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('stage_instances')
        .update(updateData)
        .eq('id', stageInstanceId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'stage_status_changed',
        entity_type: 'stage_instances',
        entity_id: stageInstanceId.toString(),
        before_data: { status: oldStatus },
        after_data: { status: newStatus },
        details: { package_id: packageId, stage_id: oldStage?.stage_id }
      });

      toast({ title: 'Stage Updated', description: `Status changed to ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}` });
      fetchStages();
    } catch (error: any) {
      console.error('Error updating stage instance:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>No stages configured for this package instance.</p>
        <p className="text-sm mt-1">Stage tracking will be available once stages are assigned.</p>
      </div>
    );
  }

  const renderStageRow = (stage: StageInstance) => {
    const statusOption = STATUS_OPTIONS.find(s => s.value === stage.status) || STATUS_OPTIONS[0];
    const StatusIcon = statusOption.icon;
    const isExpanded = expandedStages.has(stage.id);

    return (
      <Collapsible
        key={stage.id}
        open={isExpanded}
        onOpenChange={() => toggleStageExpanded(stage.id)}
      >
        <div 
          className={cn(
            "rounded-lg border bg-card overflow-hidden",
            stage.status === 2 && "border-destructive/50 bg-destructive/5",
            stage.status === 3 && "border-primary/50 bg-primary/5"
          )}
        >
          <div className="flex items-center justify-between gap-4 p-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <StatusIcon className={cn("h-5 w-5 shrink-0", statusOption.color)} />
              <div className="min-w-0">
                <p className="font-medium truncate">{stage.stage_name}</p>
                {stage.shortname && (
                  <p className="text-xs text-muted-foreground">{stage.shortname}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {stage.comment && (
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant="outline" className="text-xs gap-1">
                <ListTodo className="h-3 w-3" />
                Tasks
              </Badge>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs gap-1 cursor-pointer hover:bg-accent transition-colors",
                  stage.is_recurring 
                    ? "text-primary border-primary/30" 
                    : "text-muted-foreground border-border"
                )}
                onClick={(e) => { e.stopPropagation(); setRecurringConfirm(stage); }}
              >
                <RefreshCw className="h-3 w-3" />
                {stage.is_recurring ? 'Recurring' : 'Once'}
              </Badge>
              {stage.released_client_tasks && (
                <Badge variant="outline" className="text-xs">Tasks Released</Badge>
              )}
              {stage.status_date && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {format(new Date(stage.status_date), 'd MMM HH:mm')}
                </span>
              )}
              
              <Select
                value={stage.status.toString()}
                onValueChange={(value) => updateStageStatus(stage.id, parseInt(value))}
                disabled={updating === stage.id}
              >
                <SelectTrigger className="w-[140px]">
                  {updating === stage.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      <div className="flex items-center gap-2">
                        <option.icon className={cn("h-4 w-4", option.color)} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <CollapsibleContent>
            <StageDetailSection
              stageInstanceId={stage.id}
              tenantId={tenantId}
              packageId={packageId}
              stageId={stage.stage_id}
              completionDate={stage.completion_date}
              comment={stage.comment}
              onUpdate={fetchStages}
            />
            <StageStaffTasks 
              stageInstanceId={stage.id}
              tenantId={tenantId}
              packageId={packageId}
            />
            <StageDocumentsSection
              stageInstanceId={stage.id}
              tenantId={tenantId}
              packageId={packageId}
              debug={profile?.unicorn_role === 'Super Admin' || profile?.global_role === 'SuperAdmin'}
              isVivacityStaff={profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader' || profile?.unicorn_role === 'Team Member'}
            />
            <StageEmailsSection
              stageInstanceId={stage.id}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  // Determine if we should show phase grouping
  const hasPhases = phasesEnabled && phaseProgress.length > 0;

  // Build a set of stage_ids that belong to phases (for identifying ungrouped)
  const phasedStageIds = new Set<number>();
  if (hasPhases) {
    // We need to fetch which stages belong to which phase for this package instance
    // The phase progress summary gives us phase info, but stage mapping comes from phase_stages
    // For now, we'll group stages by checking if their stage_id appears in any phase_stages row
  }

  return (
    <div className="space-y-2">
      {hasPhases ? (
        <>
          {phaseProgress.map(phase => {
            // Show all stages under each phase — in a real implementation, 
            // we'd filter stages by their phase_stages mapping.
            // For now, show the phase headers with all stages listed flat underneath.
            return (
              <PhaseGroupHeader key={phase.phase_instance_id} phase={phase}>
                <div className="space-y-2">
                  {/* Stages will be grouped here once phase_stages mapping is loaded */}
                  <p className="text-xs text-muted-foreground">
                    {phase.total_stages} stage{phase.total_stages !== 1 ? 's' : ''} in this phase
                    {' · '}{phase.completed_stages} completed
                  </p>
                </div>
              </PhaseGroupHeader>
            );
          })}
          {/* All stages (flat list below phases for now) */}
          {stages.map(renderStageRow)}
        </>
      ) : (
        stages.map(renderStageRow)
      )}

      <LegacyDataDiagnostics
        tenantId={tenantId}
        packageId={packageId}
        stageInstanceIds={stages.map(s => s.id)}
      />

      <AlertDialog open={!!recurringConfirm} onOpenChange={(open) => !open && setRecurringConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Recurring Status</AlertDialogTitle>
            <AlertDialogDescription>
              Set <strong>{recurringConfirm?.stage_name}</strong> to{' '}
              <strong>{recurringConfirm?.is_recurring ? 'Once' : 'Recurring'}</strong>?
              {recurringConfirm?.is_recurring
                ? ' This stage will no longer reset on package renewal.'
                : ' This stage will reset to Not Started on package renewal.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => recurringConfirm && toggleRecurring(recurringConfirm)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
