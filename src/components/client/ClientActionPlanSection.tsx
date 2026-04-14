import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Upload, Clock, CheckCircle2, RotateCcw, AlertTriangle, Info, Wrench, Eye, Lightbulb, Send } from 'lucide-react';
import { useClientActionPlanEnhanced } from '@/hooks/useClientAuditPortal';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isPast, isThisMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AuditActionPlanItem } from '@/types/auditWorkspace';
import { ACTION_TYPE_OPTIONS, DELIVERY_MODEL_OPTIONS } from '@/types/auditWorkspace';

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const ACTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  corrective_action: <Wrench className="h-3 w-3" />,
  mandatory_rectification: <AlertTriangle className="h-3 w-3" />,
  improvement_opportunity: <Lightbulb className="h-3 w-3" />,
  observation: <Eye className="h-3 w-3" />,
};

const DELIVERY_CONTEXT: Record<string, string> = {
  client_self: 'Complete and submit evidence below',
  vivacity_assisted: 'Your consultant will work with you on this',
  vivacity_led: 'Your consultant is managing this for you',
};

export function ClientActionPlanSection() {
  const { activeTenantId } = useClientTenant();
  const { data: actions = [], isLoading } = useClientActionPlanEnhanced(activeTenantId);

  if (isLoading || actions.length === 0) {
    if (!isLoading && actions.length === 0) {
      return (
        <Card id="action-plan">
          <CardHeader>
            <CardTitle className="text-base">My Action Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              No outstanding actions from your audits. You're all caught up.
            </p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const nonObservation = actions.filter(a => a.action_type !== 'observation');
  const observations = actions.filter(a => a.action_type === 'observation');
  const openCount = nonObservation.filter(a => a.status !== 'complete').length;
  const overdue = nonObservation.filter(a => a.is_overdue).length;
  const dueThisMonth = nonObservation.filter(a => a.effective_due_date && isThisMonth(new Date(a.effective_due_date))).length;

  return (
    <Card id="action-plan">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">My Action Plan</CardTitle>
          <div className="flex gap-2 text-xs">
            <span>Total open: <strong>{openCount}</strong></span>
            {overdue > 0 && <span className="text-red-600">Overdue: <strong>{overdue}</strong></span>}
            {dueThisMonth > 0 && <span className="text-amber-600">Due this month: <strong>{dueThisMonth}</strong></span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {nonObservation.map(action => (
          <ActionCard key={action.id} action={action} />
        ))}

        {observations.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-4">Observations (for awareness only)</p>
            {observations.map(action => (
              <ObservationCard key={action.id} action={action} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActionCard({ action }: { action: AuditActionPlanItem }) {
  const [response, setResponse] = useState(action.client_response || '');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeTenantId } = useClientTenant();

  const typeOpt = ACTION_TYPE_OPTIONS.find(o => o.value === action.action_type);
  const isOverdue = action.is_overdue;
  const isVerified = action.verification_status === 'verified';
  const isRejected = action.verification_status === 'rejected';
  const isWaived = action.verification_status === 'waived';
  const isResponseSubmitted = action.verification_status === 'response_received';

  const handleSubmitResponse = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from('client_audit_actions' as any)
        .update({
          client_response: response.trim(),
          client_response_at: new Date().toISOString(),
          client_responded_by: user?.id,
          verification_status: 'response_received',
          status: 'in_progress',
        } as any)
        .eq('id', action.id);
      if (error) throw error;
      toast.success('Response submitted — awaiting consultant review');
    } catch (err: any) {
      toast.error('Failed to submit: ' + (err.message || 'Unknown error'));
    }
    setSubmitting(false);
  };

  const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTenantId) return;
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const storagePath = `${activeTenantId}/audit-actions/${action.id}/${file.name}`;
      await supabase.storage.from('portal-documents').upload(storagePath, file);
      await supabase.from('portal_documents' as any).insert({
        tenant_id: activeTenantId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type,
        direction: 'inbound',
        linked_audit_action_id: action.id,
        source: 'client_upload',
        is_client_visible: true,
        status: 'received',
        uploaded_by: user?.id,
      } as any);
      toast.success('Evidence uploaded');
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    }
    e.target.value = '';
  };

  return (
    <Card className={cn('border', isOverdue && 'border-red-200')}>
      <CardContent className="p-4 space-y-3">
        {/* Verification banners */}
        {isVerified && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-md p-2">
            <CheckCircle2 className="h-4 w-4" />
            Verified{action.verified_at ? ` on ${format(new Date(action.verified_at), 'd MMM yyyy')}` : ''}
          </div>
        )}
        {isRejected && (
          <div className="bg-amber-50 rounded-md p-2 space-y-1">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <RotateCcw className="h-4 w-4" />
              Your consultant has requested resubmission
            </div>
            {action.verification_notes && (
              <p className="text-xs text-amber-600">{action.verification_notes}</p>
            )}
          </div>
        )}
        {isWaived && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
            <Info className="h-4 w-4" /> Waived
          </div>
        )}
        {isResponseSubmitted && (
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-md p-2">
            <Send className="h-4 w-4" /> Response submitted — awaiting consultant review
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {typeOpt && (
                <Badge variant="outline" className={cn('text-[10px] gap-1', typeOpt.color)}>
                  {ACTION_TYPE_ICONS[action.action_type]} {typeOpt.label}
                </Badge>
              )}
              <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[action.priority])}>{action.priority}</Badge>
            </div>
            <p className="text-sm font-medium">{action.title}</p>
            {action.standard_reference && (
              <p className="text-xs text-muted-foreground">Standard: {action.standard_reference}</p>
            )}
          </div>
          {action.effective_due_date && (
            <div className={cn('text-xs text-right', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
              <Clock className="h-3 w-3 inline mr-1" />
              Due: {format(new Date(action.effective_due_date), 'd MMM yyyy')}
            </div>
          )}
        </div>

        {/* Client notes */}
        {(action.client_notes || action.description) && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">What you need to do</p>
            <p className="text-sm whitespace-pre-wrap">{action.client_notes || action.description}</p>
          </div>
        )}

        {/* Delivery context */}
        <div className="flex gap-3 text-xs text-muted-foreground">
          {action.assigned_to_name && (
            <span>Your consultant: <strong>{action.assigned_to_name}</strong></span>
          )}
          {action.delivery_model && (
            <span className="italic">{DELIVERY_CONTEXT[action.delivery_model] || ''}</span>
          )}
        </div>

        {/* Response and evidence (only if not verified/waived/complete) */}
        {!isVerified && !isWaived && action.status !== 'complete' && (
          <>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Your response</p>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
                placeholder="Describe what you have done to address this action..."
                disabled={isResponseSubmitted}
              />
            </div>

            {action.evidence_required && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Evidence required</p>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Upload document
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.zip,.jpg,.jpeg,.png" onChange={handleUploadEvidence} />
              </div>
            )}

            {!isResponseSubmitted && (
              <Button
                size="sm"
                onClick={handleSubmitResponse}
                disabled={!response.trim() || submitting}
              >
                <Send className="h-3.5 w-3.5 mr-1" /> Submit response
              </Button>
            )}
          </>
        )}

        {/* Status */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          Status: {action.status === 'open' ? 'Open' : action.status === 'in_progress' ? 'In Progress' : action.status === 'complete' ? 'Complete' : action.status}
        </div>
      </CardContent>
    </Card>
  );
}

function ObservationCard({ action }: { action: AuditActionPlanItem }) {
  return (
    <Card className="border bg-muted/30">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1 bg-gray-100 text-gray-600 border-gray-300">
            <Eye className="h-3 w-3" /> Observation
          </Badge>
        </div>
        <p className="text-sm font-medium">{action.title}</p>
        {action.standard_reference && (
          <p className="text-xs text-muted-foreground">Standard: {action.standard_reference}</p>
        )}
        {(action.client_notes || action.description) && (
          <p className="text-sm text-muted-foreground">{action.client_notes || action.description}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          This is noted for your awareness. No action is required.
        </div>
      </CardContent>
    </Card>
  );
}
