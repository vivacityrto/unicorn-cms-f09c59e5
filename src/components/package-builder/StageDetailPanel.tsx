import { useState, useEffect } from 'react';
import { Stage, useStageDetail, usePackageBuilder } from '@/hooks/usePackageBuilder';
import { useStageActiveUsage } from '@/hooks/useStageActiveUsage';
import { usePackageStageOverrides, useResolvedStageContent } from '@/hooks/useStageTemplateContent';
import { useCopyTemplateToPackage, usePackageOverrides } from '@/hooks/usePackageStageOverrides';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  X, Plus, Trash2, Users, Mail, FileText, CheckSquare, 
  GripVertical, Clock, User, Loader2, AlertTriangle, Settings, Copy, ShieldAlert,
  ExternalLink, RotateCcw, FileStack, GitCompare, RefreshCw
} from 'lucide-react';
import { StageDocumentsTab } from './StageDocumentsTab';
import { BulkGenerateDocumentsDialog } from './BulkGenerateDocumentsDialog';
import { StageDiffView } from './StageDiffView';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface StageDetailPanelProps {
  packageId: number;
  stageId: number;
  stage?: Stage;
  allStages?: Stage[];
  onClose: () => void;
}

const STAGE_TYPE_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { value: 'delivery', label: 'Delivery', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  { value: 'support', label: 'Ongoing Support', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  { value: 'offboarding', label: 'Offboarding', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground' }
];

export function StageDetailPanel({ packageId, stageId, stage, allStages = [], onClose }: StageDetailPanelProps) {
  const { toast } = useToast();
  const { emailTemplates, updateStage, createStage } = usePackageBuilder();
  
  // Override management
  const {
    useOverrides,
    loading: overridesLoading,
    copyTemplateToOverrides,
    resetToTemplate
  } = usePackageStageOverrides(packageId, stageId);

  // Enhanced override hook with diff tracking
  const { diffSummary, lastSyncedAt, refetch: refetchOverrides } = usePackageOverrides(packageId, stageId);

  // New RPC-based template copy with source tracking
  const { copyTemplate, copying: isCopyingTemplate } = useCopyTemplateToPackage();

  // Resolved content - uses template or overrides based on flag
  const {
    teamTasks: resolvedTeamTasks,
    clientTasks: resolvedClientTasks,
    emails: resolvedEmails,
    documents: resolvedDocuments,
    loading: resolvedLoading,
    source: contentSource,
    refetch: refetchResolved
  } = useResolvedStageContent(packageId, stageId);

  // Legacy hook for package-specific editing (when overrides enabled)
  const {
    staffTasks,
    clientTasks,
    stageEmails,
    documents,
    stageDocuments,
    loading,
    addStaffTask,
    updateStaffTask,
    deleteStaffTask,
    addClientTask,
    updateClientTask,
    deleteClientTask,
    addStageEmail,
    removeStageEmail,
    addStageDocument,
    addBulkStageDocuments,
    updateStageDocument,
    removeStageDocument,
    reorderStageDocuments
  } = useStageDetail(packageId, stageId);

  // Check if stage is used by active client packages
  const { activeUsage } = useStageActiveUsage(stageId);
  const isUsedByActiveClients = activeUsage.count > 0;

  const [activeTab, setActiveTab] = useState('settings');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingClientTask, setIsAddingClientTask] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [isDuplicatingStage, setIsDuplicatingStage] = useState(false);
  const [isBulkGenerateOpen, setIsBulkGenerateOpen] = useState(false);
  const [editConfirmationOpen, setEditConfirmationOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<Stage> | null>(null);
  const [hasConfirmedEditing, setHasConfirmedEditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    owner_role: 'Admin',
    estimated_hours: '',
    is_mandatory: true
  });
  const [clientTaskForm, setClientTaskForm] = useState({
    name: '',
    description: '',
    instructions: '',
    due_date_offset: ''
  });
  const [emailForm, setEmailForm] = useState({
    email_template_id: '',
    trigger_type: 'manual',
    recipient_type: 'tenant'
  });

  // Check if stage is reused
  const usageCount = stage?.usage_count || 0;
  const isReused = usageCount > 1;

  // Determine which content to display
  const displayTeamTasks = useOverrides ? staffTasks : resolvedTeamTasks;
  const displayClientTasks = useOverrides ? clientTasks : resolvedClientTasks;
  const displayEmails = useOverrides ? stageEmails : resolvedEmails;
  const displayDocuments = useOverrides ? stageDocuments : resolvedDocuments;
  const isReadOnly = !useOverrides;

  // Toggle is_recurring on the appropriate table
  const handleToggleRecurring = async (task: any) => {
    const newVal = !task.is_recurring;
    try {
      if (useOverrides) {
        await supabase
          .from('package_staff_tasks')
          .update({ is_recurring: newVal } as any)
          .eq('id', task.id);
      } else {
        await supabase
          .from('stage_team_tasks')
          .update({ is_recurring: newVal } as any)
          .eq('id', task.id);
      }
      // Also sync to staff_tasks if source link exists
      if (task.source_stage_task_id) {
        await supabase
          .from('staff_tasks')
          .update({ is_recurring: newVal } as any)
          .eq('id', task.source_stage_task_id);
      }
      toast({ title: 'Updated', description: `Task marked as ${newVal ? 'recurring' : 'once-off'}` });
      refetchResolved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateStage = async (updates: Partial<Stage>) => {
    if (!stage) return;
    
    // If stage is used by active clients and user hasn't confirmed, prompt confirmation
    if (isUsedByActiveClients && !hasConfirmedEditing) {
      setPendingUpdate(updates);
      setEditConfirmationOpen(true);
      return;
    }
    
    try {
      await updateStage(stage.id, updates);
      toast({ title: 'Stage Updated' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update stage',
        variant: 'destructive'
      });
    }
  };

  const confirmAndApplyUpdate = async () => {
    setHasConfirmedEditing(true);
    setEditConfirmationOpen(false);
    if (pendingUpdate) {
      try {
        await updateStage(stage!.id, pendingUpdate);
        toast({ title: 'Stage Updated' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update stage',
          variant: 'destructive'
        });
      }
      setPendingUpdate(null);
    }
  };

  const handleDuplicateStage = async () => {
    if (!stage) return;
    try {
      setIsDuplicatingStage(true);
      // Create a new stage with the same properties
      const newStage = await createStage({
        title: `${stage.title} (Copy)`,
        short_name: stage.short_name,
        description: stage.description,
        stage_type: stage.stage_type,
        video_url: stage.video_url,
        ai_hint: stage.ai_hint,
        is_reusable: true,
        dashboard_visible: stage.dashboard_visible
      });
        toast({
          title: 'Stage Duplicated',
          description: `Created "${newStage.title}" in the library.`
        });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to duplicate stage',
        variant: 'destructive'
      });
    } finally {
      setIsDuplicatingStage(false);
    }
  };

  const handleEnableOverrides = async () => {
    setIsCopying(true);
    try {
      // Use new RPC function with source tracking
      await copyTemplate(packageId, stageId);
      await refetchResolved();
      await refetchOverrides();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to enable overrides',
        variant: 'destructive'
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleResetToTemplate = async () => {
    setIsResetting(true);
    try {
      await resetToTemplate();
      await refetchResolved();
      setShowResetConfirm(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset to template',
        variant: 'destructive'
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleAddStaffTask = async () => {
    if (!taskForm.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Task name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addStaffTask({
        name: taskForm.name,
        description: taskForm.description,
        owner_role: taskForm.owner_role,
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
        is_mandatory: taskForm.is_mandatory
      });
      toast({ title: 'Task Added' });
      setTaskForm({ name: '', description: '', owner_role: 'Admin', estimated_hours: '', is_mandatory: true });
      setIsAddingTask(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add task',
        variant: 'destructive'
      });
    }
  };

  const handleAddClientTask = async () => {
    if (!clientTaskForm.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Task name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addClientTask({
        name: clientTaskForm.name,
        description: clientTaskForm.description,
        instructions: clientTaskForm.instructions,
        due_date_offset: clientTaskForm.due_date_offset ? parseInt(clientTaskForm.due_date_offset) : null
      });
      toast({ title: 'Client Task Added' });
      setClientTaskForm({ name: '', description: '', instructions: '', due_date_offset: '' });
      setIsAddingClientTask(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add client task',
        variant: 'destructive'
      });
    }
  };

  const handleAddEmail = async () => {
    if (!emailForm.email_template_id) {
      toast({
        title: 'Validation Error',
        description: 'Please select an email template',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addStageEmail(emailForm.email_template_id, emailForm.trigger_type, emailForm.recipient_type);
      toast({ title: 'Email Added' });
      setEmailForm({ email_template_id: '', trigger_type: 'manual', recipient_type: 'tenant' });
      setIsAddingEmail(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add email',
        variant: 'destructive'
      });
    }
  };

  if (loading || overridesLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getStageTypeColor = (stageType: string) => {
    return STAGE_TYPE_OPTIONS.find(opt => opt.value === stageType)?.color || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{stage?.title || 'Stage Details'}</h2>
          <div className="flex items-center gap-2 mt-1">
            {stage?.stage_type && (
              <Badge variant="outline" className={getStageTypeColor(stage.stage_type)}>
                {STAGE_TYPE_OPTIONS.find(o => o.value === stage.stage_type)?.label || stage.stage_type}
              </Badge>
            )}
            {isReused && (
              <Badge variant="secondary" className="text-xs">
                Used in {usageCount} packages
              </Badge>
            )}
            {useOverrides ? (
              <Badge variant="default" className="text-xs bg-amber-500/20 text-amber-700 border-amber-500/30">
                <FileStack className="h-3 w-3 mr-1" />
                Package Override
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Using Template
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Override Control Banner */}
      <Card className="border-dashed">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileStack className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">
                  {useOverrides ? 'Package Override Active' : 'Using Stage Template'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {useOverrides 
                    ? 'Edits apply only to this package. Other packages use the template.'
                    : 'Content is inherited from the stage template. Enable override to customize for this package.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {useOverrides ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResetConfirm(true)}
                    disabled={isResetting}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Template
                  </Button>
                  <Link to={`/admin/stages/${stageId}`}>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Edit Template
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleEnableOverrides}
                    disabled={isCopying}
                  >
                    {isCopying ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Override for This Package
                  </Button>
                  <Link to={`/admin/stages/${stageId}`}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Edit Template
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Client Warning - shows first as it's more critical */}
      {isUsedByActiveClients && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-destructive">This stage is in use by active clients</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span className="text-destructive/80">
              {activeUsage.clients.length} active client{activeUsage.clients.length !== 1 ? 's' : ''} are using this stage. 
              Editing may affect their ongoing work.
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleDuplicateStage}
              disabled={isDuplicatingStage}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Copy className="h-3 w-3 mr-1" />
              {isDuplicatingStage ? 'Duplicating...' : 'Duplicate & Edit Copy Stage'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Reuse Warning - package-level */}
      {isReused && !isUsedByActiveClients && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800">
              This stage is shared across {usageCount} packages. Template changes will affect all of them.
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleDuplicateStage}
              disabled={isDuplicatingStage}
            >
              <Copy className="h-3 w-3 mr-1" />
              {isDuplicatingStage ? 'Duplicating...' : 'Duplicate Stage'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Read-only notice when using template */}
      {isReadOnly && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Content below is read-only. To edit, either{' '}
            <button onClick={handleEnableOverrides} className="underline font-medium">
              enable override for this package
            </button>{' '}
            or{' '}
            <Link to={`/admin/stages/${stageId}`} className="underline font-medium">
              edit the stage template
            </Link>.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="settings" className="text-xs">
            <Settings className="h-3 w-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="team-tasks" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            Team
          </TabsTrigger>
          <TabsTrigger value="emails" className="text-xs">
            <Mail className="h-3 w-3 mr-1" />
            Emails
          </TabsTrigger>
          <TabsTrigger value="client-tasks" className="text-xs">
            <CheckSquare className="h-3 w-3 mr-1" />
            Client
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Docs
          </TabsTrigger>
          {useOverrides && (
            <TabsTrigger value="diff" className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />
              Diff
              {diffSummary.overridden > 0 && (
                <span className="ml-1 bg-amber-500/20 text-amber-700 px-1 rounded text-[10px]">
                  {diffSummary.overridden}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Stage Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage Name</Label>
                  <Input
                    value={stage?.title || ''}
                    onChange={(e) => handleUpdateStage({ title: e.target.value })}
                    placeholder="e.g., Client Onboarding"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stage Type</Label>
                  <Select 
                    value={stage?.stage_type || 'delivery'} 
                    onValueChange={(value) => handleUpdateStage({ stage_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={stage?.description || ''}
                  onChange={(e) => handleUpdateStage({ description: e.target.value })}
                  placeholder="Describe what this stage involves..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Short Name</Label>
                  <Input
                    value={stage?.short_name || ''}
                    onChange={(e) => handleUpdateStage({ short_name: e.target.value })}
                    placeholder="e.g., Onboard"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reusable</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Switch
                      checked={stage?.is_reusable ?? true}
                      onCheckedChange={(checked) => handleUpdateStage({ is_reusable: checked })}
                      disabled={isReused}
                    />
                    <span className="text-sm text-muted-foreground">
                      {isReused ? 'Cannot change (already reused)' : (stage?.is_reusable ? 'Yes' : 'No')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Video URL (optional)</Label>
                <Input
                  value={stage?.video_url || ''}
                  onChange={(e) => handleUpdateStage({ video_url: e.target.value })}
                  placeholder="https://youtube.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label>AI Hint (optional)</Label>
                <Textarea
                  value={stage?.ai_hint || ''}
                  onChange={(e) => handleUpdateStage({ ai_hint: e.target.value })}
                  placeholder="Hints for AI suggestions..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tasks Tab */}
        <TabsContent value="team-tasks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team Tasks</CardTitle>
                  <CardDescription>{displayTeamTasks.length} tasks configured</CardDescription>
                </div>
                {useOverrides && (
                  <Button size="sm" onClick={() => setIsAddingTask(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Task
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px]">
                {displayTeamTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No team tasks configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayTeamTasks.map((task: any, index: number) => (
                      <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{task.name}</span>
                            {task.is_mandatory && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.owner_role}
                            </span>
                            {task.estimated_hours && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {task.estimated_hours}h
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleRecurring(task);
                              }}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-colors ${
                                task.is_recurring
                                  ? 'border-primary/30 bg-primary/10 text-primary'
                                  : 'border-border hover:border-muted-foreground/40'
                              }`}
                              title={task.is_recurring ? 'Recurring: resets on renewal' : 'Once-off: not reset on renewal'}
                            >
                              <RefreshCw className="h-3 w-3" />
                              {task.is_recurring ? 'Recurring' : 'Once-off'}
                            </button>
                          </div>
                        </div>
                        {useOverrides && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteStaffTask(task.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emails Tab */}
        <TabsContent value="emails" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Email Triggers</CardTitle>
                  <CardDescription>{displayEmails.length} emails configured</CardDescription>
                </div>
                {useOverrides && (
                  <Button size="sm" onClick={() => setIsAddingEmail(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Email
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px]">
                {displayEmails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No emails configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayEmails.map((email: any) => {
                      const templateName = email.email_template?.internal_name || 
                        email.email_templates?.internal_name || 
                        emailTemplates.find(t => t.id === email.email_template_id)?.internal_name ||
                        'Unknown Template';
                      return (
                        <div key={email.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium block">{templateName}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {email.trigger_type.replace('_', ' ')}
                              </Badge>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {email.recipient_type}
                              </Badge>
                            </div>
                          </div>
                          {useOverrides && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeStageEmail(email.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Client Tasks Tab */}
        <TabsContent value="client-tasks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Client Tasks</CardTitle>
                  <CardDescription>{displayClientTasks.length} tasks visible to tenants</CardDescription>
                </div>
                {useOverrides && (
                  <Button size="sm" onClick={() => setIsAddingClientTask(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Task
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px]">
                {displayClientTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckSquare className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No client tasks configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayClientTasks.map((task: any) => (
                      <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{task.name}</span>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                          )}
                          {task.due_date_offset && (
                            <span className="text-xs text-muted-foreground mt-1 block">
                              Due: +{task.due_date_offset} days from stage start
                            </span>
                          )}
                        </div>
                        {useOverrides && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteClientTask(task.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          {useOverrides ? (
            <StageDocumentsTab
              packageId={packageId}
              stageId={stageId}
              stageDocuments={stageDocuments}
              onAddDocument={addStageDocument}
              onAddBulkDocuments={addBulkStageDocuments}
              onUpdateDocument={updateStageDocument}
              onRemoveDocument={removeStageDocument}
              onReorderDocuments={reorderStageDocuments}
              onOpenBulkGenerate={() => setIsBulkGenerateOpen(true)}
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Documents</CardTitle>
                    <CardDescription>{displayDocuments.length} documents configured</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  {displayDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No documents configured</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayDocuments.map((doc: any) => (
                        <div key={doc.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium block">
                              {doc.document?.title || doc.documents?.doc_name || 'Document'}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {doc.visibility}
                              </Badge>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {doc.delivery_type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Diff View Tab - only visible when overrides are enabled */}
        {useOverrides && (
          <TabsContent value="diff" className="mt-4">
            <StageDiffView
              packageId={packageId}
              stageId={stageId}
              stageName={stage?.title || 'Stage'}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Add Staff Task Dialog */}
      <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Task</DialogTitle>
            <DialogDescription>
              Create a new task for team members to complete during this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={taskForm.name}
                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="e.g., Schedule kickoff call"
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Describe what needs to be done..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner Role</Label>
                <Select 
                  value={taskForm.owner_role} 
                  onValueChange={(value) => setTaskForm({ ...taskForm, owner_role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="CSC">CSC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={taskForm.estimated_hours}
                  onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                  placeholder="e.g., 1.5"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={taskForm.is_mandatory}
                onCheckedChange={(checked) => setTaskForm({ ...taskForm, is_mandatory: checked })}
              />
              <Label>Mandatory task</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingTask(false)}>Cancel</Button>
            <Button onClick={handleAddStaffTask}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Client Task Dialog */}
      <Dialog open={isAddingClientTask} onOpenChange={setIsAddingClientTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Client Task</DialogTitle>
            <DialogDescription>
              Create a task visible to tenants in the client portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={clientTaskForm.name}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, name: e.target.value })}
                placeholder="e.g., Complete onboarding form"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={clientTaskForm.description}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, description: e.target.value })}
                placeholder="Brief description of the task..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={clientTaskForm.instructions}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, instructions: e.target.value })}
                placeholder="Detailed instructions for the client..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Offset (days)</Label>
              <Input
                type="number"
                min={0}
                value={clientTaskForm.due_date_offset}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, due_date_offset: e.target.value })}
                placeholder="e.g., 7"
              />
              <p className="text-xs text-muted-foreground">
                Days after stage start when this task is due
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingClientTask(false)}>Cancel</Button>
            <Button onClick={handleAddClientTask}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Email Dialog */}
      <Dialog open={isAddingEmail} onOpenChange={setIsAddingEmail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Email Trigger</DialogTitle>
            <DialogDescription>
              Configure an email to be sent during this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Template *</Label>
              <Select 
                value={emailForm.email_template_id} 
                onValueChange={(value) => setEmailForm({ ...emailForm, email_template_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {emailTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.internal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select 
                  value={emailForm.trigger_type} 
                  onValueChange={(value) => setEmailForm({ ...emailForm, trigger_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_stage_start">On Stage Start</SelectItem>
                    <SelectItem value="on_task_complete">On Task Complete</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recipient</Label>
                <Select 
                  value={emailForm.recipient_type} 
                  onValueChange={(value) => setEmailForm({ ...emailForm, recipient_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal (Team)</SelectItem>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingEmail(false)}>Cancel</Button>
            <Button onClick={handleAddEmail}>Add Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Generate Documents Dialog */}
      <BulkGenerateDocumentsDialog
        open={isBulkGenerateOpen}
        onOpenChange={setIsBulkGenerateOpen}
        packageId={packageId}
        stageId={stageId}
        stageName={stage?.title || 'Stage'}
        stageDocuments={stageDocuments}
      />

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all package-specific overrides for this stage and use the template content instead. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetToTemplate} disabled={isResetting}>
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reset to Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Confirmation Dialog for stages in active use */}
      <AlertDialog open={editConfirmationOpen} onOpenChange={setEditConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Confirm Edit to Active Stage
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This stage is currently being used by <strong>{activeUsage.clients.length} active client{activeUsage.clients.length !== 1 ? 's' : ''}</strong>. 
                Changes will affect their ongoing packages.
              </p>
              {activeUsage.clients.length > 0 && activeUsage.clients.length <= 5 && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Affected clients:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {activeUsage.clients.map(c => (
                      <li key={c.tenant_id}>{c.tenant_name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p>Are you sure you want to proceed?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndApplyUpdate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
