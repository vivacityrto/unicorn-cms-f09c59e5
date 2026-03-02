import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClientPackageInstances, ClientPackageInstance, ClientPackageStage } from '@/hooks/useClientPackageInstances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Package2,
  Calendar,
  User,
  CheckCircle2,
  Circle,
  PlayCircle,
  PauseCircle,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Users,
  Mail,
  FileText,
  Clock
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 border-green-500',
  paused: 'bg-amber-500/10 text-amber-600 border-amber-500',
  closed: 'bg-gray-500/10 text-gray-600 border-gray-500'
};

const STAGE_STATUS_COLORS: Record<string, string> = {
  'Not Started': 'bg-gray-500/10 text-gray-600 border-gray-500',
  'In Progress': 'bg-blue-500/10 text-blue-600 border-blue-500',
  'Completed': 'bg-green-500/10 text-green-600 border-green-500',
  'N/A': 'bg-amber-500/10 text-amber-600 border-amber-500',
  not_started: 'bg-gray-500/10 text-gray-600 border-gray-500',
  in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500',
  complete: 'bg-green-500/10 text-green-600 border-green-500',
  skipped: 'bg-amber-500/10 text-amber-600 border-amber-500'
};

const TASK_STATUS_COLORS: Record<string, string> = {
  'Not Started': 'bg-gray-500/10 text-gray-600',
  'In Progress': 'bg-blue-500/10 text-blue-600',
  'Completed': 'bg-green-500/10 text-green-600',
  'N/A': 'bg-red-500/10 text-red-600',
  open: 'bg-gray-500/10 text-gray-600',
  in_progress: 'bg-blue-500/10 text-blue-600',
  done: 'bg-green-500/10 text-green-600',
  blocked: 'bg-red-500/10 text-red-600',
};

// Map legacy status_id to UI status keys for select controls
const STAGE_STATUS_ID_TO_KEY: Record<number, string> = {
  0: 'not_started',
  1: 'in_progress',
  2: 'complete',
  3: 'skipped',
};

const TASK_STATUS_ID_TO_KEY: Record<number, string> = {
  0: 'open',
  1: 'in_progress',
  2: 'done',
  3: 'blocked',
};

export default function ClientPackageDetail() {
  const { clientPackageId } = useParams();
  const navigate = useNavigate();
  const {
    fetchPackageDetail,
    fetchPackageStages,
    updateStageStatus,
    updateTeamTaskStatus,
    updateClientTaskStatus
  } = useClientPackageInstances();

  const [packageData, setPackageData] = useState<ClientPackageInstance | null>(null);
  const [stages, setStages] = useState<ClientPackageStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState('stages');

  useEffect(() => {
    if (clientPackageId) {
      loadData();
    }
  }, [clientPackageId]);

  const loadData = async () => {
    if (!clientPackageId) return;
    setLoading(true);
    
    const [pkgData, stagesData] = await Promise.all([
      fetchPackageDetail(clientPackageId),
      fetchPackageStages(clientPackageId)
    ]);

    setPackageData(pkgData);
    setStages(stagesData);
    setLoading(false);
  };

  const toggleStage = (stageId: number) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const handleStageStatusChange = async (stageId: number, status: string) => {
    const success = await updateStageStatus(String(stageId), status as any);
    if (success) {
      loadData();
    }
  };

  const handleTeamTaskStatusChange = async (taskId: number, status: string) => {
    const success = await updateTeamTaskStatus(String(taskId), status as any);
    if (success) {
      loadData();
    }
  };

  const handleClientTaskStatusChange = async (taskId: number, status: number) => {
    const success = await updateClientTaskStatus(taskId, status);
    if (success) {
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!packageData) {
    return (
      <div className="p-6 text-center">
        <p>Client package not found</p>
        <Button onClick={() => navigate(-1)} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const completedStages = stages.filter(s => s.status_id === 2).length;
  const progressPercent = stages.length > 0 ? (completedStages / stages.length) * 100 : 0;

  const totalTeamTasks = stages.reduce((sum, s) => sum + (s.team_tasks?.length || 0), 0);
  const openTeamTasks = stages.reduce((sum, s) => sum + (s.team_tasks?.filter(t => t.status_id < 2).length || 0), 0);
  const totalClientTasks = stages.reduce((sum, s) => sum + (s.client_tasks?.length || 0), 0);
  const openClientTasks = stages.reduce((sum, s) => sum + (s.client_tasks?.filter(t => t.status === 0).length || 0), 0);
  const pendingEmails = stages.reduce((sum, s) => sum + (s.emails?.filter(e => !e.is_sent).length || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="p-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/manage-tenants/${packageData.tenant_id}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Client
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{packageData.package?.name}</h1>
                  <Badge variant="outline" className={STATUS_COLORS[packageData.status]}>
                    {packageData.status === 'active' && <PlayCircle className="h-3 w-3 mr-1" />}
                    {packageData.status === 'paused' && <PauseCircle className="h-3 w-3 mr-1" />}
                    {packageData.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">{packageData.tenant?.name}</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold">{stages.length}</p>
                <p className="text-xs text-muted-foreground">Phases</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{openTeamTasks}</p>
                <p className="text-xs text-muted-foreground">Team Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{openClientTasks}</p>
                <p className="text-xs text-muted-foreground">Client Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{pendingEmails}</p>
                <p className="text-xs text-muted-foreground">Emails Pending</p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{completedStages}/{stages.length} phases complete</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Started {new Date(packageData.start_date).toLocaleDateString()}
            </div>
            {packageData.assigned_csc_user_id && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                CSC Assigned
              </div>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList className="bg-transparent border-b-0 h-auto p-0 gap-4">
            <TabsTrigger
              value="stages"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
            >
              <ListTodo className="h-4 w-4 mr-2" />
              Phases ({stages.length})
            </TabsTrigger>
            <TabsTrigger
              value="team-tasks"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
            >
              <Users className="h-4 w-4 mr-2" />
              Team Tasks ({totalTeamTasks})
            </TabsTrigger>
            <TabsTrigger
              value="client-tasks"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Client Tasks ({totalClientTasks})
            </TabsTrigger>
            <TabsTrigger
              value="emails"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-1 pb-3"
            >
              <Mail className="h-4 w-4 mr-2" />
              Emails ({pendingEmails} pending)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="stages" className="mt-0 space-y-4">
            {stages.map((stage, index) => {
              const isExpanded = expandedStages.has(stage.id);
              const stageStatusKey = STAGE_STATUS_ID_TO_KEY[stage.status_id] || 'not_started';
              const openTeam = stage.team_tasks?.filter(t => t.status_id < 2).length || 0;
              const openClient = stage.client_tasks?.filter(t => t.status !== 2).length || 0;

              return (
                <Collapsible key={stage.id} open={isExpanded} onOpenChange={() => toggleStage(stage.id)}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-medium">{stage.stage?.title}</h3>
                            {stage.stage?.short_name && (
                              <p className="text-sm text-muted-foreground">{stage.stage.short_name}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS.not_started}>
                            {stage.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {openTeam} open
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              {openClient} open
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              {stage.documents?.length || 0}
                            </span>
                          </div>

                          <Select value={stageStatusKey} onValueChange={(v) => handleStageStatusChange(stage.id, v)}>
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Not Started</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                              <SelectItem value="skipped">Skipped</SelectItem>
                            </SelectContent>
                          </Select>

                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                    </CardContent>

                    <CollapsibleContent>
                      <div className="border-t px-4 py-4 space-y-4 bg-muted/30">
                        {/* Team Tasks */}
                        {stage.team_tasks && stage.team_tasks.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Team Tasks
                            </h4>
                            <div className="space-y-2">
                              {stage.team_tasks.map((task) => {
                                const taskStatusKey = TASK_STATUS_ID_TO_KEY[task.status_id] || 'open';
                                return (
                                  <div key={task.id} className="flex items-center justify-between bg-background p-3 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Circle className={`h-4 w-4 ${task.status_id === 2 ? 'fill-green-500 text-green-500' : 'text-muted-foreground'}`} />
                                      <div>
                                        <p className="text-sm font-medium">{task.name}</p>
                                      </div>
                                    </div>
                                    <Select value={taskStatusKey} onValueChange={(v) => handleTeamTaskStatusChange(task.id, v)}>
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="open">Open</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="done">Done</SelectItem>
                                        <SelectItem value="blocked">Blocked</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Client Tasks */}
                        {stage.client_tasks && stage.client_tasks.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              Client Tasks
                            </h4>
                            <div className="space-y-2">
                              {stage.client_tasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between bg-background p-3 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <Circle className={`h-4 w-4 ${task.status === 2 ? 'fill-green-500 text-green-500' : 'text-muted-foreground'}`} />
                                    <div>
                                      <p className="text-sm font-medium">{task.name}</p>
                                      {task.due_date && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          Due {new Date(task.due_date).toLocaleDateString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <Select value={String(task.status)} onValueChange={(v) => handleClientTaskStatusChange(task.id, parseInt(v))}>
                                    <SelectTrigger className="w-[120px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="0">Not Started</SelectItem>
                                      <SelectItem value="1">In Progress</SelectItem>
                                      <SelectItem value="2">Completed</SelectItem>
                                      <SelectItem value="3">N/A</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Documents */}
                        {stage.documents && stage.documents.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Documents
                            </h4>
                            <div className="space-y-2">
                              {stage.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between bg-background p-3 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                      <p className="text-sm font-medium">{doc.document?.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {doc.status || 'pending'} {doc.isgenerated ? '• Generated' : ''}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </TabsContent>

          <TabsContent value="team-tasks" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Team Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stages.flatMap(stage => 
                    (stage.team_tasks || []).map(task => {
                      const taskStatusKey = TASK_STATUS_ID_TO_KEY[task.status_id] || 'open';
                      return (
                        <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className={TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.open}>
                              {task.status}
                            </Badge>
                            <div>
                              <p className="font-medium">{task.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {stage.stage?.title}
                              </p>
                            </div>
                          </div>
                          <Select value={taskStatusKey} onValueChange={(v) => handleTeamTaskStatusChange(task.id, v)}>
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })
                  )}
                  {totalTeamTasks === 0 && (
                    <p className="text-center text-muted-foreground py-8">No team tasks</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="client-tasks" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  All Client Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stages.flatMap(stage => 
                    (stage.client_tasks || []).map(task => (
                      <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={TASK_STATUS_COLORS[task.status_label] || TASK_STATUS_COLORS.open}>
                            {task.status_label}
                          </Badge>
                          <div>
                            <p className="font-medium">{task.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {stage.stage?.title}
                              {task.due_date && ` • Due ${new Date(task.due_date).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <Select value={String(task.status)} onValueChange={(v) => handleClientTaskStatusChange(task.id, parseInt(v))}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Not Started</SelectItem>
                            <SelectItem value="1">In Progress</SelectItem>
                            <SelectItem value="2">Completed</SelectItem>
                            <SelectItem value="3">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))
                  )}
                  {totalClientTasks === 0 && (
                    <p className="text-center text-muted-foreground py-8">No client tasks</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stages.flatMap(stage => 
                    (stage.emails || []).map(email => (
                      <div key={email.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={
                            !email.is_sent ? 'bg-amber-500/10 text-amber-600' :
                            'bg-green-500/10 text-green-600'
                          }>
                            {email.is_sent ? 'Sent' : 'Pending'}
                          </Badge>
                          <div>
                            <p className="font-medium">{email.subject || stage.stage?.title}</p>
                          </div>
                        </div>
                        {email.sent_date && (
                          <p className="text-sm text-muted-foreground">
                            Sent {new Date(email.sent_date).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                  {pendingEmails === 0 && stages.every(s => !s.emails?.length) && (
                    <p className="text-center text-muted-foreground py-8">No emails in queue</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
