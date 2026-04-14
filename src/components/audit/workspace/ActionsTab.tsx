import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, CheckCircle2, RefreshCw, ArrowRight, Wrench, AlertTriangle, Lightbulb, Eye, ChevronDown, ShieldCheck, Pencil } from 'lucide-react';
import { useAuditActions, useAuditFindings, useInternalUsers } from '@/hooks/useAuditWorkspace';
import { useSyncAuditActions } from '@/hooks/useAuditActionPlan';
import { useAuth } from '@/hooks/useAuth';
import { ACTION_STATUS_OPTIONS, ACTION_TYPE_OPTIONS, DELIVERY_MODEL_OPTIONS, VERIFICATION_STATUS_OPTIONS } from '@/types/auditWorkspace';
import type { AuditAction, AuditFinding } from '@/types/auditWorkspace';
import { ActionDrawer } from './ActionDrawer';
import { VerificationDrawer } from './VerificationDrawer';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  corrective_action: <Wrench className="h-3.5 w-3.5" />,
  mandatory_rectification: <AlertTriangle className="h-3.5 w-3.5" />,
  improvement_opportunity: <Lightbulb className="h-3.5 w-3.5" />,
  observation: <Eye className="h-3.5 w-3.5" />,
};

export function ActionsTab({ auditId, auditStatus, subjectTenantId }: ActionsTabProps) {
  const { data: actions, createAction, updateAction, deleteAction } = useAuditActions(auditId);
  const { data: findings } = useAuditFindings(auditId);
  const { data: users } = useInternalUsers();
  const { session } = useAuth();
  const syncActions = useSyncAuditActions();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editAction, setEditAction] = useState<AuditAction | null>(null);
  const [linkedFinding, setLinkedFinding] = useState<AuditFinding | null>(null);
  const [verifyDrawerOpen, setVerifyDrawerOpen] = useState(false);
  const [verifyAction, setVerifyAction] = useState<AuditAction | null>(null);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterDelivery, setFilterDelivery] = useState('all');
  const [filterVerification, setFilterVerification] = useState('all');

  const isComplete = auditStatus === 'complete';
  const syncedCount = actions?.filter(a => a.client_action_item_id).length || 0;

  const filtered = (actions || []).filter(a => {
    if (filterType !== 'all' && a.action_type !== filterType) return false;
    if (filterDelivery !== 'all' && a.delivery_model !== filterDelivery) return false;
    if (filterVerification !== 'all' && a.verification_status !== filterVerification) return false;
    return true;
  });

  const statCounts = {
    open: actions?.filter(a => a.status === 'open').length || 0,
    in_progress: actions?.filter(a => a.status === 'in_progress').length || 0,
    complete: actions?.filter(a => a.status === 'complete').length || 0,
    overdue: actions?.filter(a => a.status !== 'complete' && a.status !== 'cancelled' && a.due_date && new Date(a.due_date) < new Date()).length || 0,
    awaiting_verification: actions?.filter(a => a.verification_status === 'response_received').length || 0,
    client_self: actions?.filter(a => a.delivery_model === 'client_self').length || 0,
    vivacity_assisted: actions?.filter(a => a.delivery_model === 'vivacity_assisted').length || 0,
  };

  const handleOpenDrawer = (action?: AuditAction, finding?: AuditFinding) => {
    setEditAction(action || null);
    setLinkedFinding(finding || null);
    setDrawerOpen(true);
  };

  const handleSaveAction = (data: Partial<AuditAction> & { audit_id: string }) => {
    const { id, ...rest } = data as any;
    if (id) {
      updateAction.mutate({ id, ...rest });
    } else {
      createAction.mutate({ ...rest, created_by: session?.user?.id });
    }
  };

  const handleVerify = async (actionId: string, decision: 'verified' | 'rejected' | 'waived', notes: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    const updates: any = {
      verification_status: decision,
      verification_notes: notes || null,
      verified_by: user?.id,
      verified_at: new Date().toISOString(),
    };
    if (decision === 'verified' || decision === 'waived') {
      updates.status = 'complete';
    }
    updateAction.mutate({ id: actionId, ...updates });
    toast.success(decision === 'verified' ? 'Action verified' : decision === 'waived' ? 'Action waived' : 'Resubmission requested');
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
      <div className="flex flex-wrap gap-4 text-sm">
        <span>Open: <strong>{statCounts.open}</strong></span>
        <span>In Progress: <strong>{statCounts.in_progress}</strong></span>
        <span>Complete: <strong>{statCounts.complete}</strong></span>
        <span className={statCounts.overdue > 0 ? 'text-red-600' : ''}>
          Overdue: <strong>{statCounts.overdue}</strong>
        </span>
        {statCounts.awaiting_verification > 0 && (
          <span className="text-blue-600">
            <ShieldCheck className="h-3.5 w-3.5 inline mr-0.5" />
            Awaiting verification: <strong>{statCounts.awaiting_verification}</strong>
          </span>
        )}
        <span className="text-muted-foreground">Client self: {statCounts.client_self}</span>
        <span className="text-muted-foreground">Vivacity-assisted: {statCounts.vivacity_assisted}</span>
      </div>

      {/* Filter bar + Add */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACTION_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDelivery} onValueChange={setFilterDelivery}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Delivery model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery</SelectItem>
            {DELIVERY_MODEL_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterVerification} onValueChange={setFilterVerification}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verification</SelectItem>
            {VERIFICATION_STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => handleOpenDrawer()}>
          <Plus className="h-3 w-3 mr-1" /> Add Action
        </Button>
      </div>

      {/* Action cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {(actions?.length || 0) > 0 ? 'No actions match the current filters.' : 'No corrective actions yet. Create actions from findings or manually.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(action => {
            const typeOpt = ACTION_TYPE_OPTIONS.find(o => o.value === action.action_type);
            const deliveryOpt = DELIVERY_MODEL_OPTIONS.find(o => o.value === action.delivery_model);
            const verOpt = VERIFICATION_STATUS_OPTIONS.find(o => o.value === action.verification_status);
            const isOverdue = action.status !== 'complete' && action.status !== 'cancelled' && action.due_date && new Date(action.due_date) < new Date();

            return (
              <Card key={action.id} className={cn(isOverdue && 'border-red-200')}>
                <CardContent className="p-4 space-y-3">
                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {typeOpt && (
                      <Badge variant="outline" className={cn('text-[10px] gap-1', typeOpt.color)}>
                        {ACTION_TYPE_ICONS[action.action_type]} {typeOpt.label}
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[action.status])}>
                      {ACTION_STATUS_OPTIONS.find(o => o.value === action.status)?.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{action.priority}</Badge>
                    {deliveryOpt && (
                      <Badge variant="secondary" className="text-[10px]">{deliveryOpt.label}</Badge>
                    )}
                    {verOpt && action.verification_status !== 'pending' && (
                      <Badge variant="outline" className={cn('text-[10px]', verOpt.color)}>
                        {verOpt.label}
                      </Badge>
                    )}
                  </div>

                  {/* Title + standard ref */}
                  <div>
                    <p className="text-sm font-medium">{action.title}</p>
                    {action.standard_reference && (
                      <p className="text-xs text-muted-foreground">Standard ref: {action.standard_reference}</p>
                    )}
                  </div>

                  {/* Client notes preview */}
                  {action.client_notes && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Client Notes</p>
                      <p className="text-xs text-foreground line-clamp-2">{action.client_notes}</p>
                    </div>
                  )}

                  {/* Labels */}
                  {action.labels && action.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {action.labels.map((l, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{l}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {action.assigned_to && (
                      <span>Assigned: {users?.find(u => u.user_uuid === action.assigned_to)?.first_name || 'Unknown'}</span>
                    )}
                    {action.due_date && (
                      <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                        Due: {new Date(action.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {action.evidence_required && (
                      <span>Evidence: required</span>
                    )}
                    {isComplete && (
                      action.client_action_item_id ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Synced
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs h-5 px-2" onClick={() => syncActions.mutate(auditId)}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Sync
                        </Button>
                      )
                    )}
                  </div>

                  {/* Internal notes (collapsible) */}
                  {action.internal_notes && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ChevronDown className="h-3 w-3" /> Internal notes
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-1 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs">
                        {action.internal_notes}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pt-1 border-t">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleOpenDrawer(action)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {action.verification_status === 'response_received' && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setVerifyAction(action); setVerifyDrawerOpen(true); }}>
                        <ShieldCheck className="h-3 w-3 mr-1" /> Verify
                      </Button>
                    )}
                    <Select
                      value={action.status}
                      onValueChange={(v) => updateAction.mutate({ id: action.id, status: v as any })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs ml-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_STATUS_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => deleteAction.mutate(action.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Drawers */}
      <ActionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        action={editAction}
        finding={linkedFinding}
        users={users || []}
        auditId={auditId}
        onSave={handleSaveAction}
      />
      <VerificationDrawer
        open={verifyDrawerOpen}
        onOpenChange={setVerifyDrawerOpen}
        action={verifyAction}
        onVerify={handleVerify}
      />
    </div>
  );
}
