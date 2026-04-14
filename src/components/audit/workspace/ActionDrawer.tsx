import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Wrench, AlertTriangle, Lightbulb, Eye, ChevronDown, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditAction, AuditFinding, ActionType, DeliveryModel } from '@/types/auditWorkspace';
import { ACTION_TYPE_OPTIONS, DELIVERY_MODEL_OPTIONS, PRIORITY_OPTIONS } from '@/types/auditWorkspace';

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  corrective_action: <Wrench className="h-4 w-4" />,
  mandatory_rectification: <AlertTriangle className="h-4 w-4" />,
  improvement_opportunity: <Lightbulb className="h-4 w-4" />,
  observation: <Eye className="h-4 w-4" />,
};

interface ActionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: AuditAction | null;
  finding?: AuditFinding | null;
  users: Array<{ user_uuid: string; first_name: string; last_name: string }>;
  auditId: string;
  onSave: (data: Partial<AuditAction> & { audit_id: string }) => void;
}

export function ActionDrawer({ open, onOpenChange, action, finding, users, auditId, onSave }: ActionDrawerProps) {
  const isEdit = !!action;

  const [actionType, setActionType] = useState<ActionType>('corrective_action');
  const [title, setTitle] = useState('');
  const [standardReference, setStandardReference] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [deliveryModel, setDeliveryModel] = useState<DeliveryModel>('client_self');
  const [assignedTo, setAssignedTo] = useState<string>('__none__');
  const [clientNotes, setClientNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [internalNotes, setInternalNotes] = useState('');
  const [description, setDescription] = useState('');
  const [internalOpen, setInternalOpen] = useState(false);

  useEffect(() => {
    if (action) {
      setActionType(action.action_type || 'corrective_action');
      setTitle(action.title || '');
      setStandardReference(action.standard_reference || '');
      setLabelsInput((action.labels || []).join(', '));
      setDeliveryModel(action.delivery_model || 'client_self');
      setAssignedTo(action.assigned_to || '__none__');
      setClientNotes(action.client_notes || '');
      setDueDate(action.due_date || '');
      setPriority(action.priority || 'medium');
      setEvidenceRequired(action.evidence_required ?? true);
      setInternalNotes(action.internal_notes || '');
      setDescription(action.description || '');
    } else if (finding) {
      setTitle(finding.summary || '');
      setStandardReference(finding.standard_reference || '');
      setPriority(finding.priority || 'medium');
      setActionType('corrective_action');
      setDeliveryModel('client_self');
      setAssignedTo('__none__');
      setClientNotes('');
      setDueDate('');
      setEvidenceRequired(true);
      setInternalNotes('');
      setDescription('');
      setLabelsInput('');
    } else {
      setActionType('corrective_action');
      setTitle('');
      setStandardReference('');
      setLabelsInput('');
      setDeliveryModel('client_self');
      setAssignedTo('__none__');
      setClientNotes('');
      setDueDate('');
      setPriority('medium');
      setEvidenceRequired(true);
      setInternalNotes('');
      setDescription('');
    }
  }, [action, finding, open]);

  const handleSave = () => {
    if (!title.trim()) return;
    const labels = labelsInput.split(',').map(l => l.trim()).filter(Boolean);
    onSave({
      audit_id: auditId,
      ...(action ? { id: action.id } : {}),
      action_type: actionType,
      title: title.trim(),
      standard_reference: standardReference.trim() || null,
      labels,
      delivery_model: deliveryModel,
      assigned_to: assignedTo === '__none__' ? null : assignedTo,
      client_notes: clientNotes.trim() || null,
      due_date: dueDate || null,
      priority: priority as any,
      evidence_required: evidenceRequired,
      internal_notes: internalNotes.trim() || null,
      description: description.trim() || null,
      finding_id: finding?.id || action?.finding_id || null,
      status: action?.status || 'open',
    });
    onOpenChange(false);
  };

  const needsClientNotes = actionType === 'corrective_action' || actionType === 'mandatory_rectification';
  const showAssignee = deliveryModel === 'vivacity_assisted' || deliveryModel === 'vivacity_led';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Action' : 'Add Action'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Finding link */}
          {(finding || action?.finding_id) && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
              <Link2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="text-blue-600 font-medium">Linked to finding: </span>
                <span className="text-blue-800">{finding?.summary || 'Finding linked'}</span>
              </div>
            </div>
          )}

          {/* Section A: Identity */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Action Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setActionType(opt.value as ActionType)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors',
                    actionType === opt.value
                      ? `${opt.color} border-current font-medium`
                      : 'border-border hover:bg-muted'
                  )}
                  title={opt.description}
                >
                  {ACTION_TYPE_ICONS[opt.value]}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Action title" />
            </div>
            <div>
              <Label className="text-xs">Standard Reference</Label>
              <Input value={standardReference} onChange={(e) => setStandardReference(e.target.value)} placeholder="e.g. Standard 1.3 or NC Standard 4" />
            </div>
            <div>
              <Label className="text-xs">Labels</Label>
              <Input value={labelsInput} onChange={(e) => setLabelsInput(e.target.value)} placeholder="Comma-separated tags" />
            </div>
          </div>

          {/* Section B: Delivery */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Who Does the Work</h3>
            <div className="space-y-2">
              {DELIVERY_MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDeliveryModel(opt.value as DeliveryModel)}
                  className={cn(
                    'w-full flex flex-col rounded-md border p-3 text-left text-sm transition-colors',
                    deliveryModel === opt.value
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              ))}
            </div>
            {showAssignee && (
              <div>
                <Label className="text-xs">Assigned Vivacity Consultant</Label>
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
            )}
          </div>

          {/* Section C: Client-facing */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client-Facing Details</h3>
            <div>
              <Label className="text-xs">Client action description {needsClientNotes ? '*' : ''}</Label>
              <p className="text-xs text-muted-foreground mb-1">This is what appears in the client's portal. Write it in plain language for the RTO.</p>
              <Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={4} placeholder="What the client needs to do..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Due Date {needsClientNotes ? '*' : ''}</Label>
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
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Evidence required</Label>
                <p className="text-xs text-muted-foreground">Require client to upload evidence of completion</p>
              </div>
              <Switch checked={evidenceRequired} onCheckedChange={setEvidenceRequired} />
            </div>
          </div>

          {/* Section D: Internal notes */}
          <Collapsible open={internalOpen} onOpenChange={setInternalOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider w-full">
              <ChevronDown className={cn('h-4 w-4 transition-transform', internalOpen && 'rotate-180')} />
              Internal Notes (not visible to client)
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              <div>
                <Label className="text-xs">Vivacity context</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} placeholder="Background, approach, what to check..." />
              </div>
              <div>
                <Label className="text-xs">Auditor notes</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Additional auditor notes..." />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Save */}
          <div className="flex gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={!title.trim()} className="flex-1">
              {isEdit ? 'Update Action' : 'Create Action'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
