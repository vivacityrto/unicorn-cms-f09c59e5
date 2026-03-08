import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { StageClientTasks } from './StageClientTasks';
import { StageDetailSection } from './StageDetailSection';
import { StageDocumentsSection } from './StageDocumentsSection';
import { StageEmailsSection } from './StageEmailsSection';
import { StageNotesSection } from './StageNotesSection';
import { LegacyDataDiagnostics } from './LegacyDataDiagnostics';
import { PhaseGroupHeader } from './PhaseGroupHeader';
import { useCheckpointPhasesEnabled } from '@/hooks/useCheckpointPhasesEnabled';
import { usePhaseProgress } from '@/hooks/usePhaseProgress';
import { useStageCounts } from '@/hooks/useStageCounts';
import { useTaskStatusOptions, getStatusIcon, getStatusColor, getStatusLabel } from '@/hooks/useTaskStatusOptions';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  ListTodo,
  MessageSquare,
  RefreshCw,
  FileText,
  Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageInstance {
  id: number;
  stage_id: number;
  stage_name: string;
  shortname: string | null;
  stage_type: string | null;
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
  packageInstanceId?: number;
  autoExpandStageInstanceId?: number;
}

// STATUS_OPTIONS and STATUS_MAP removed — now driven by useTaskStatusOptions hook

interface StageRowProps {
  stage: StageInstance;
  isExpanded: boolean;
  onToggleExpand: () => void;
  updating: number | null;
  onStatusChange: (stageId: number, newStatus: number) => void;
  onRecurringClick: (stage: StageInstance) => void;
  tenantId: number;
  packageId: number;
  packageInstanceId?: number;
  onUpdate: () => void;
  profile: any;
}

function StageRow({ stage, isExpanded, onToggleExpand, updating, onStatusChange, onRecurringClick, tenantId, packageId, packageInstanceId, onUpdate, profile }: StageRowProps) {
  const { statuses } = useTaskStatusOptions();
  const statusCode = typeof stage.status === 'number' ? stage.status : 0;
  const StatusIcon = getStatusIcon(statusCode);
  const statusColor = getStatusColor(statusCode);
  const statusLabel = statuses.find(s => s.code === statusCode)?.label || `Status ${statusCode}`;
  const { staffTasks, clientTasks, documents, emails, loading: countsLoading } = useStageCounts(stage.id);

  const countBadge = (count: number) =>
    !countsLoading ? (
      <span className="ml-1 text-muted-foreground">({count})</span>
    ) : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <div
        className={cn(
          "rounded-lg border bg-card overflow-hidden",
          stage.status === 2 && "border-primary/50 bg-primary/5",
          stage.status === 5 && "border-destructive/50 bg-destructive/5",
          stage.status === 6 && "border-amber-500/30 bg-amber-500/5"
        )}
      >
        <div className="flex items-center justify-between gap-4 p-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <StatusIcon className={cn("h-5 w-5 shrink-0", statusColor)} />
            <div className="min-w-0">
              <p className="font-medium truncate">{stage.stage_name}</p>
              {stage.shortname && <p className="text-xs text-muted-foreground">{stage.shortname}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {stage.comment && <MessageSquare className="h-4 w-4 text-muted-foreground" />}
            {stage.released_client_tasks && <Badge variant="outline" className="text-xs">Tasks Released</Badge>}
            <Badge
              variant="outline"
              className={cn(
                "text-xs gap-1 cursor-pointer hover:bg-accent transition-colors",
                stage.is_recurring ? "text-primary border-primary/30" : "text-muted-foreground border-border"
              )}
              onClick={(e) => { e.stopPropagation(); onRecurringClick(stage); }}
            >
              <RefreshCw className="h-3 w-3" />
              {stage.is_recurring ? 'Recurring' : 'Once'}
            </Badge>
            {statusCode === 2 && stage.completion_date ? (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Completed {format(new Date(stage.completion_date), 'd MMM yyyy')}
              </span>
            ) : stage.status_date ? (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {format(new Date(stage.status_date), 'd MMM HH:mm')}
              </span>
            ) : null}
            <Select
              value={stage.status.toString()}
              onValueChange={(value) => onStatusChange(stage.id, parseInt(value))}
              disabled={updating === stage.id}
            >
              <SelectTrigger className="w-[140px]">
                {updating === stage.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                {statuses.map((opt) => {
                  const OptIcon = getStatusIcon(opt.code);
                  const optColor = getStatusColor(opt.code);
                  return (
                    <SelectItem key={opt.code} value={opt.code.toString()}>
                      <div className="flex items-center gap-2">
                        <OptIcon className={cn("h-4 w-4", optColor)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  );
                })}
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
            stageStatus={typeof stage.status === 'number' ? stage.status : 0}
            onUpdate={onUpdate}
          />
          <Tabs defaultValue="staff-tasks" className="border-t">
            <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 h-auto p-0">
              <TabsTrigger value="staff-tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5 px-4 py-2">
                <ListTodo className="h-3.5 w-3.5" />
                Staff Tasks{countBadge(staffTasks)}
              </TabsTrigger>
              <TabsTrigger value="client-tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5 px-4 py-2">
                <ListTodo className="h-3.5 w-3.5" />
                Client Tasks{countBadge(clientTasks)}
              </TabsTrigger>
              <TabsTrigger value="emails" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5 px-4 py-2">
                <Mail className="h-3.5 w-3.5" />
                Emails{countBadge(emails)}
              </TabsTrigger>
              <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5 px-4 py-2">
                <FileText className="h-3.5 w-3.5" />
                Documents{countBadge(documents)}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff-tasks" className="mt-0">
              <StageStaffTasks stageInstanceId={stage.id} tenantId={tenantId} packageId={packageId} packageInstanceId={packageInstanceId ?? undefined} stageStatusId={statusCode} stageName={stage.stage_name} />
            </TabsContent>
            <TabsContent value="client-tasks" className="mt-0">
              <StageClientTasks stageInstanceId={stage.id} tenantId={tenantId} packageId={packageId} />
            </TabsContent>
            <TabsContent value="emails" className="mt-0">
              <StageEmailsSection stageInstanceId={stage.id} tenantId={tenantId} packageId={packageId} />
            </TabsContent>
            <TabsContent value="documents" className="mt-0">
              <StageDocumentsSection
                stageInstanceId={stage.id}
                tenantId={tenantId}
                packageId={packageId}
                debug={profile?.unicorn_role === 'Super Admin' || profile?.global_role === 'SuperAdmin'}
                isVivacityStaff={profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader' || profile?.unicorn_role === 'Team Member'}
              />
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function PackageStagesManager({ tenantId, packageId, packageName, packageInstanceId: propInstanceId, autoExpandStageInstanceId }: PackageStagesManagerProps) {
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

  // Auto-expand stage when navigated via deep link
  useEffect(() => {
    if (autoExpandStageInstanceId && stages.length > 0) {
      setExpandedStages(prev => new Set(prev).add(autoExpandStageInstanceId));
    }
  }, [autoExpandStageInstanceId, stages]);

  const fetchStages = async () => {
    setLoading(true);
    try {
      let resolvedInstanceId = propInstanceId ?? null;

      if (!resolvedInstanceId) {
        // Fallback: find the package_instance for this tenant + package
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
        resolvedInstanceId = instanceData.id;
      }

      setPackageInstanceId(resolvedInstanceId);

      // Fetch stage_instances for this package_instance
      const stageResult = await (supabase
        .from('stage_instances' as any)
        .select('id, stage_id, status, status_date, completion_date, comment, paid, released_client_tasks, is_recurring')
        .eq('packageinstance_id', resolvedInstanceId)
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
        .select('id, name, shortname, stage_type')
        .in('id', stageIds);

      if (metaError) throw metaError;

      // Create a lookup map for stage metadata
      const stageMap = new Map(stagesMetadata?.map(s => [s.id, s]) || []);

      // Transform the data
      const transformed: StageInstance[] = stageData.map((row: any) => {
        const meta = stageMap.get(row.stage_id);
        const stageType = (meta as any)?.stage_type || null;
        // Auto-default: if stage type is 'monitor' or 'monitoring' and status is 0 (Not Started), show as Monitor (6)
        const resolvedStatus = ((stageType === 'monitor' || stageType === 'monitoring') && (row.status === 0 || row.status === null || row.status === '0')) ? 6 : (row.status ?? 0);
        return {
          id: row.id,
          stage_id: row.stage_id,
          stage_name: meta?.name || `Stage ${row.stage_id}`,
          shortname: meta?.shortname || null,
          stage_type: stageType,
          status: resolvedStatus,
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

      // Set completion_date if completing (code 2 = Completed)
      if (newStatus === 2 && oldStatus !== 2) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('stage_instances')
        .update(updateData)
        .eq('id', stageInstanceId);

      if (error) throw error;

      // Core Complete auto-flag: mark incomplete staff tasks as non-core
      if (newStatus === 4) {
        const { error: coreError } = await supabase
          .from('staff_task_instances')
          .update({ is_core: false })
          .eq('stageinstance_id', stageInstanceId)
          .neq('status_id', 2);

        if (coreError) {
          console.error('Error flagging non-core tasks:', coreError);
        } else {
          // Audit the bulk non-core flag
          await supabase.from('client_audit_log').insert({
            tenant_id: tenantId,
            actor_user_id: profile?.user_uuid,
            action: 'staff_tasks_flagged_non_core',
            entity_type: 'staff_task_instances',
            entity_id: stageInstanceId.toString(),
            before_data: { is_core: true },
            after_data: { is_core: false },
            details: { package_id: packageId, stage_instance_id: stageInstanceId, reason: 'core_complete_status' }
          });
        }
      }

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

      toast({ title: 'Stage Updated', description: `Status changed to ${getStatusLabel(newStatus, [])}` });
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

  const renderStageRow = (stage: StageInstance) => (
    <StageRow
      key={stage.id}
      stage={stage}
      isExpanded={expandedStages.has(stage.id)}
      onToggleExpand={() => toggleStageExpanded(stage.id)}
      updating={updating}
      onStatusChange={updateStageStatus}
      onRecurringClick={(s) => setRecurringConfirm(s)}
      tenantId={tenantId}
      packageId={packageId}
      packageInstanceId={packageInstanceId ?? undefined}
      onUpdate={fetchStages}
      profile={profile}
    />
  );

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
