import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuditActions, useAuditFindings, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { useSyncAuditActions } from '@/hooks/useAuditActionPlan';
import { useAuth } from '@/hooks/useAuth';
import { ACTION_STATUS_OPTIONS, PRIORITY_OPTIONS } from '@/types/auditWorkspace';
import { cn } from '@/lib/utils';

interface ActionsTabProps {
  auditId: string;
  auditStatus?: string;
  subjectTenantId?: number;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  complete: 'bg-green-100 text-green-800',
  deferred: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-400',
};

export function ActionsTab({ auditId, auditStatus, subjectTenantId }: ActionsTabProps) {
  const { data: actions, createAction, updateAction, deleteAction } = useAuditActions(auditId);
  const { data: findings } = useAuditFindings(auditId);
  const { data: users } = useInternalUsers();
  const { session } = useAuth();
  const syncActions = useSyncAuditActions();
  const [showForm, setShowForm] = useState(false);

  const isComplete = auditStatus === 'complete';
  const syncedCount = actions?.filter(a => (a as any).client_action_item_id).length || 0;

  const statCounts = {
    open: actions?.filter(a => a.status === 'open').length || 0,
    in_progress: actions?.filter(a => a.status === 'in_progress').length || 0,
    complete: actions?.filter(a => a.status === 'complete').length || 0,
    overdue: actions?.filter(a => a.status !== 'complete' && a.due_date && new Date(a.due_date) < new Date()).length || 0,
  };

  return (
    <div className="space-y-4">
      {/* Completion sync banner */}
      {isComplete && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-green-800">
              This audit is complete. {syncedCount} action{syncedCount !== 1 ? 's' : ''} synced to the client action plan.
            </span>
            {subjectTenantId && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/tenant/${subjectTenantId}?tab=actions`}>
                  View in client folder <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span>Open: <strong>{statCounts.open}</strong></span>
        <span>In Progress: <strong>{statCounts.in_progress}</strong></span>
        <span>Complete: <strong>{statCounts.complete}</strong></span>
        <span className={statCounts.overdue > 0 ? 'text-red-600' : ''}>
          Overdue: <strong>{statCounts.overdue}</strong>
        </span>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Action
        </Button>
      </div>

      {showForm && (
        <AddActionForm
          auditId={auditId}
          findings={findings || []}
          users={users || []}
          onSave={(action) => {
            createAction.mutate({ ...action, created_by: session?.user?.id });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {!actions || actions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            No corrective actions yet. Create actions from findings or manually.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map(action => (
            <Card key={action.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[action.status])}>
                        {ACTION_STATUS_OPTIONS.find(o => o.value === action.status)?.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {action.priority}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{action.title}</p>
                    {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {action.assigned_to && (
                        <span>Assigned: {users?.find(u => u.user_uuid === action.assigned_to)?.first_name || 'Unknown'}</span>
                      )}
                      {action.due_date && (
                        <span className={new Date(action.due_date) < new Date() && action.status !== 'complete' ? 'text-red-600' : ''}>
                          Due: {new Date(action.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {/* Sync status */}
                      {isComplete && (
                        (action as any).client_action_item_id ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Synced to action plan
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => syncActions.mutate(auditId)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" /> Sync now
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      value={action.status}
                      onValueChange={(v) => updateAction.mutate({ id: action.id, status: v as any })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_STATUS_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => deleteAction.mutate(action.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddActionForm({
  auditId,
  findings,
  users,
  onSave,
  onCancel,
}: {
  auditId: string;
  findings: any[];
  users: any[];
  onSave: (action: any) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('__none__');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [findingId, setFindingId] = useState('__none__');

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-4 space-y-3">
        <div>
          <Label className="text-xs">Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.user_uuid} value={u.user_uuid}>{u.first_name} {u.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Linked Finding</Label>
            <Select value={findingId} onValueChange={setFindingId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {findings.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.summary?.substring(0, 40)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => {
            if (!title.trim()) return;
            onSave({
              audit_id: auditId,
              title: title.trim(),
              description: description.trim() || null,
              assigned_to: assignedTo === '__none__' ? null : assignedTo,
              due_date: dueDate || null,
              priority,
              finding_id: findingId === '__none__' ? null : findingId,
              status: 'open',
            });
          }} disabled={!title.trim()}>
            Save Action
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
