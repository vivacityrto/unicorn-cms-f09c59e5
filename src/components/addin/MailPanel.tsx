import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Mail, 
  Link2, 
  ListTodo, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2,
  Calendar
} from 'lucide-react';
import type { MailContext, AddinUser } from '@/lib/addin/types';
import { captureEmail, createTaskFromEmail } from '@/lib/addin/emailApi';
import { useAddinLookups } from '@/hooks/useAddinLookups';
import { format } from 'date-fns';

interface MailPanelProps {
  mailContext: MailContext;
  user: AddinUser | null;
  tenantId?: number | null;
}

type ActionMode = 'idle' | 'link' | 'task';
type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

export function MailPanel({ mailContext, user, tenantId }: MailPanelProps) {
  const [mode, setMode] = useState<ActionMode>('idle');
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);

  // Form state
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState<string>('');
  const [taskDueDate, setTaskDueDate] = useState('');

  const { clients, packages, users, isLoading: lookupsLoading } = useAddinLookups(tenantId);

  const resetForm = () => {
    setMode('idle');
    setStatus('idle');
    setError(null);
    setSuccessMessage(null);
    setDeepLink(null);
    setSelectedClientId(null);
    setSelectedPackageId(null);
    setTaskTitle('');
    setTaskAssignee('');
    setTaskDueDate('');
  };

  const handleLinkEmail = async () => {
    if (!selectedClientId) {
      setError('Please select a client');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const result = await captureEmail(
        mailContext,
        selectedClientId,
        selectedPackageId || undefined
      );

      setStatus('success');
      setSuccessMessage('Email linked successfully!');
      setDeepLink(result.deep_link);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to link email');
    }
  };

  const handleCreateTask = async () => {
    if (!selectedClientId) {
      setError('Please select a client');
      return;
    }
    if (!taskTitle.trim()) {
      setError('Please enter a task title');
      return;
    }
    if (!taskAssignee) {
      setError('Please select an assignee');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const result = await createTaskFromEmail(
        mailContext,
        selectedClientId,
        taskTitle,
        taskAssignee,
        taskDueDate || undefined
      );

      setStatus('success');
      setSuccessMessage(`Task "${result.task.title}" created!`);
      setDeepLink(result.deep_link);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  // Pre-fill task title from email subject
  const handleStartTask = () => {
    setMode('task');
    setTaskTitle(`Follow up: ${mailContext.subject}`);
    if (user?.user_uuid) {
      setTaskAssignee(user.user_uuid);
    }
  };

  const receivedDate = mailContext.receivedAt 
    ? format(new Date(mailContext.receivedAt), 'MMM d, yyyy h:mm a')
    : 'Unknown date';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Email Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email summary */}
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="font-medium text-sm line-clamp-2">{mailContext.subject}</h3>
          <p className="text-xs text-muted-foreground">
            From: {mailContext.sender.name} ({mailContext.sender.email})
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {receivedDate}
          </div>
          {mailContext.attachments && mailContext.attachments.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {mailContext.attachments.length} attachment(s)
            </Badge>
          )}
        </div>

        <Separator />

        {/* Status messages */}
        {status === 'success' && successMessage && (
          <Alert className="bg-accent/50 border-accent">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="text-foreground">
              {successMessage}
              {deepLink && (
                <Button
                  variant="link"
                  size="sm"
                  className="ml-2 h-auto p-0 text-primary"
                  onClick={() => window.open(deepLink, '_blank')}
                >
                  Open in Unicorn <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action buttons or forms */}
        {mode === 'idle' && status !== 'success' && (
          <div className="flex flex-col gap-2">
            <Button 
              variant="default" 
              size="sm" 
              className="w-full justify-start"
              onClick={() => setMode('link')}
              disabled={lookupsLoading}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Link to Client
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full justify-start"
              onClick={handleStartTask}
              disabled={lookupsLoading}
            >
              <ListTodo className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </div>
        )}

        {/* Link Email Form */}
        {mode === 'link' && status !== 'success' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="client">Client *</Label>
              <Select 
                value={selectedClientId?.toString() || ''} 
                onValueChange={(v) => {
                  setSelectedClientId(parseInt(v));
                  setSelectedPackageId(null);
                }}
              >
                <SelectTrigger id="client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && packages.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="package">Package (optional)</Label>
                <Select 
                  value={selectedPackageId?.toString() || ''} 
                  onValueChange={(v) => setSelectedPackageId(v ? parseInt(v) : null)}
                >
                  <SelectTrigger id="package">
                    <SelectValue placeholder="Select a package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id.toString()}>
                        {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={resetForm}
                disabled={status === 'loading'}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleLinkEmail}
                disabled={status === 'loading' || !selectedClientId}
              >
                {status === 'loading' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Link Email
              </Button>
            </div>
          </div>
        )}

        {/* Create Task Form */}
        {mode === 'task' && status !== 'success' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="task-client">Client *</Label>
              <Select 
                value={selectedClientId?.toString() || ''} 
                onValueChange={(v) => setSelectedClientId(parseInt(v))}
              >
                <SelectTrigger id="task-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title *</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Enter task title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assign To *</Label>
              <Select 
                value={taskAssignee} 
                onValueChange={setTaskAssignee}
              >
                <SelectTrigger id="task-assignee">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date (optional)</Label>
              <Input
                id="task-due"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={resetForm}
                disabled={status === 'loading'}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleCreateTask}
                disabled={status === 'loading' || !selectedClientId || !taskTitle || !taskAssignee}
              >
                {status === 'loading' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ListTodo className="h-4 w-4 mr-2" />
                )}
                Create Task
              </Button>
            </div>
          </div>
        )}

        {/* Reset button after success */}
        {status === 'success' && (
          <Button variant="outline" size="sm" onClick={resetForm} className="w-full">
            Perform Another Action
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
