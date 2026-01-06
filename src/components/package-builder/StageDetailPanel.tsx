import { useState } from 'react';
import { Stage, useStageDetail, usePackageBuilder } from '@/hooks/usePackageBuilder';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  X, Plus, Trash2, Users, Mail, FileText, CheckSquare, 
  GripVertical, Clock, User, Loader2, AlertTriangle
} from 'lucide-react';

interface StageDetailPanelProps {
  packageId: number;
  stageId: number;
  stage?: Stage;
  onClose: () => void;
}

export function StageDetailPanel({ packageId, stageId, stage, onClose }: StageDetailPanelProps) {
  const { toast } = useToast();
  const { emailTemplates } = usePackageBuilder();
  const {
    staffTasks,
    clientTasks,
    stageEmails,
    documents,
    loading,
    addStaffTask,
    updateStaffTask,
    deleteStaffTask,
    addClientTask,
    updateClientTask,
    deleteClientTask,
    addStageEmail,
    removeStageEmail
  } = useStageDetail(packageId, stageId);

  const [activeTab, setActiveTab] = useState('team-tasks');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingClientTask, setIsAddingClientTask] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
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
    instructions: ''
  });
  const [emailForm, setEmailForm] = useState({
    email_template_id: '',
    trigger_type: 'manual',
    recipient_type: 'tenant'
  });

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
        instructions: clientTaskForm.instructions
      });
      toast({ title: 'Client Task Added' });
      setClientTaskForm({ name: '', description: '', instructions: '' });
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

  if (loading) {
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
    switch (stageType) {
      case 'onboarding': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'delivery': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'support': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'offboarding': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{stage?.title || 'Stage Details'}</CardTitle>
            {stage?.stage_type && (
              <Badge variant="outline" className={`mt-1 ${getStageTypeColor(stage.stage_type)}`}>
                {stage.stage_type}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {stage?.description && (
          <CardDescription className="mt-2">{stage.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="team-tasks" className="text-xs px-2 py-1.5">
              <Users className="h-3 w-3 mr-1" />
              Team
            </TabsTrigger>
            <TabsTrigger value="emails" className="text-xs px-2 py-1.5">
              <Mail className="h-3 w-3 mr-1" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="client-tasks" className="text-xs px-2 py-1.5">
              <CheckSquare className="h-3 w-3 mr-1" />
              Client
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs px-2 py-1.5">
              <FileText className="h-3 w-3 mr-1" />
              Docs
            </TabsTrigger>
          </TabsList>

          {/* Team Tasks */}
          <TabsContent value="team-tasks" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{staffTasks.length} tasks</span>
                <Button size="sm" variant="outline" onClick={() => setIsAddingTask(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Task
                </Button>
              </div>
              
              <ScrollArea className="h-[300px]">
                {staffTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No team tasks yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {staffTasks.map((task, index) => (
                      <div key={task.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{task.name}</span>
                            {task.is_mandatory && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteStaffTask(task.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Emails */}
          <TabsContent value="emails" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{stageEmails.length} emails</span>
                <Button size="sm" variant="outline" onClick={() => setIsAddingEmail(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Email
                </Button>
              </div>
              
              <ScrollArea className="h-[300px]">
                {stageEmails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Mail className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No emails configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stageEmails.map((email) => {
                      const template = emailTemplates.find(t => t.id === email.email_template_id);
                      return (
                        <div key={email.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">
                              {template?.internal_name || 'Unknown Template'}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{email.trigger_type}</Badge>
                              <Badge variant="secondary" className="text-xs">{email.recipient_type}</Badge>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeStageEmail(email.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Client Tasks */}
          <TabsContent value="client-tasks" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{clientTasks.length} tasks</span>
                <Button size="sm" variant="outline" onClick={() => setIsAddingClientTask(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Task
                </Button>
              </div>
              
              <ScrollArea className="h-[300px]">
                {clientTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckSquare className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No client tasks yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clientTasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{task.name}</span>
                          {task.description && (
                            <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteClientTask(task.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{documents.length} documents</span>
                <Button size="sm" variant="outline" disabled>
                  <Plus className="h-3 w-3 mr-1" />
                  Link Document
                </Button>
              </div>
              
              <ScrollArea className="h-[300px]">
                {documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No documents linked</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-start gap-2 p-2 rounded border bg-muted/30">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{doc.title}</span>
                          <div className="flex items-center gap-2 mt-1">
                            {doc.isclientdoc && (
                              <Badge variant="secondary" className="text-xs">Client</Badge>
                            )}
                            {doc.format && (
                              <Badge variant="outline" className="text-xs">{doc.format}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

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
              <Label>Description</Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Describe the task..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner Role</Label>
                <Select 
                  value={taskForm.owner_role} 
                  onValueChange={(v) => setTaskForm({ ...taskForm, owner_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="CSC">CSC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={taskForm.estimated_hours}
                  onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                  placeholder="e.g., 2.5"
                />
              </div>
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
              Create a task visible in the client portal.
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
                placeholder="Brief description..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={clientTaskForm.instructions}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, instructions: e.target.value })}
                placeholder="Step-by-step instructions for the client..."
                rows={3}
              />
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
            <DialogTitle>Add Email</DialogTitle>
            <DialogDescription>
              Configure an email to be sent during this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Template *</Label>
              <Select 
                value={emailForm.email_template_id} 
                onValueChange={(v) => setEmailForm({ ...emailForm, email_template_id: v })}
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
                  onValueChange={(v) => setEmailForm({ ...emailForm, trigger_type: v })}
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
                  onValueChange={(v) => setEmailForm({ ...emailForm, recipient_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal Team</SelectItem>
                    <SelectItem value="tenant">Tenant/Client</SelectItem>
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
    </Card>
  );
}