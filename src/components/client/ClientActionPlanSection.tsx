import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Upload, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { useClientActionPlan, useCompleteClientAction } from '@/hooks/useAuditActionPlan';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isPast, isThisMonth } from 'date-fns';
import { cn } from '@/lib/utils';

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

export function ClientActionPlanSection() {
  const { activeTenantId } = useClientTenant();
  const { data: actions = [], isLoading } = useClientActionPlan(activeTenantId);
  const completeAction = useCompleteClientAction();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadActionIdRef = useRef<string | null>(null);

  if (isLoading || actions.length === 0) {
    if (!isLoading && actions.length === 0) {
      return (
        <Card>
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

  const overdue = actions.filter(a => a.due_date && isPast(new Date(a.due_date))).length;
  const dueThisMonth = actions.filter(a => a.due_date && isThisMonth(new Date(a.due_date))).length;

  const handleUploadEvidence = (actionId: string) => {
    uploadActionIdRef.current = actionId;
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadActionIdRef.current || !activeTenantId) return;

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const storagePath = `${activeTenantId}/actions/${uploadActionIdRef.current}/${file.name}`;

      await supabase.storage.from('portal-documents').upload(storagePath, file);
      await supabase.from('portal_documents' as any).insert({
        tenant_id: activeTenantId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type,
        direction: 'inbound',
        linked_task_id: uploadActionIdRef.current,
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
    uploadActionIdRef.current = null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">My Action Plan</CardTitle>
          <div className="flex gap-2 text-xs">
            <span>Total open: <strong>{actions.length}</strong></span>
            {overdue > 0 && <span className="text-red-600">Overdue: <strong>{overdue}</strong></span>}
            {dueThisMonth > 0 && <span className="text-amber-600">Due this month: <strong>{dueThisMonth}</strong></span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map(action => (
          <Card key={action.id} className="border">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[action.priority])}>{action.priority}</Badge>
                    <p className="text-sm font-medium">{action.title}</p>
                  </div>
                  {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {action.due_date && (
                      <span className={cn('flex items-center gap-1', isPast(new Date(action.due_date)) && 'text-red-600 font-medium')}>
                        <Clock className="h-3 w-3" />
                        Due: {format(new Date(action.due_date), 'd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => completeAction.mutate(action.id)}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Mark as complete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleUploadEvidence(action.id)}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Upload evidence
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.zip,.jpg,.jpeg,.png" onChange={onFileChange} />
      </CardContent>
    </Card>
  );
}
