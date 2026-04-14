import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Check, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useClientEvidenceRequests, useUploadEvidenceItem } from '@/hooks/useAuditPrep';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Awaiting', color: 'bg-gray-100 text-gray-600' },
  received: { label: 'Uploaded', color: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  revision_requested: { label: 'Revision needed', color: 'bg-amber-100 text-amber-700' },
};

export function AuditPreparationSection() {
  const { activeTenantId } = useClientTenant();
  const { data: requests = [], isLoading } = useClientEvidenceRequests(activeTenantId);
  const uploadItem = useUploadEvidenceItem();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [expandedGuidance, setExpandedGuidance] = useState<Set<string>>(new Set());

  if (isLoading || requests.length === 0) return null;

  const handleUpload = (requestId: string, itemId: string) => {
    setUploadingItemId(itemId);
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingItemId || !activeTenantId) return;

    const request = requests.find(r => (r as any).evidence_request_items?.some((i: any) => i.id === uploadingItemId));
    if (!request) return;

    uploadItem.mutate({
      tenantId: activeTenantId,
      requestId: request.id,
      itemId: uploadingItemId,
      file,
    });

    e.target.value = '';
    setUploadingItemId(null);
  };

  const toggleGuidance = (id: string) => {
    setExpandedGuidance(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader>
        <CardTitle className="text-base">Prepare for your upcoming audit</CardTitle>
        <p className="text-sm text-muted-foreground">
          Your consultant has requested the following documents. Please upload each one before the due date.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map(req => {
          const items = (req as any).evidence_request_items || [];
          const received = items.filter((i: any) => ['received', 'accepted'].includes(i.status)).length;
          const isOverdue = req.due_date && new Date(req.due_date) < new Date();

          return (
            <Card key={req.id} className="border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{req.title}</p>
                    <p className={cn('text-xs', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                      Due {req.due_date ? format(new Date(req.due_date), 'd MMM yyyy') : '—'}
                      {isOverdue && ' — OVERDUE'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{received} / {items.length} uploaded</span>
                </div>

                {items.length > 0 && <Progress value={(received / items.length) * 100} className="h-1.5" />}

                {req.description && (
                  <p className="text-sm text-muted-foreground bg-muted/40 rounded p-3">{req.description}</p>
                )}

                <div className="space-y-2">
                  {items.map((item: any) => {
                    const statusCfg = ITEM_STATUS[item.status] || ITEM_STATUS.pending;
                    return (
                      <div key={item.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{item.item_name}</span>
                            {item.is_required && <Badge variant="outline" className="text-[9px]">Required</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-[10px]', statusCfg.color)}>{statusCfg.label}</Badge>
                            {(item.status === 'pending' || item.status === 'revision_requested') && (
                              <Button size="sm" variant="outline" onClick={() => handleUpload(req.id, item.id)}>
                                <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                              </Button>
                            )}
                          </div>
                        </div>

                        {item.guidance_text && (
                          <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => toggleGuidance(item.id)}>
                            {expandedGuidance.has(item.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Guidance
                          </button>
                        )}
                        {expandedGuidance.has(item.id) && item.guidance_text && (
                          <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{item.guidance_text}</p>
                        )}

                        {item.status === 'revision_requested' && item.review_notes && (
                          <div className="bg-amber-50 border border-amber-200 rounded p-2">
                            <p className="text-xs text-amber-800">
                              <AlertTriangle className="h-3 w-3 inline mr-1" />
                              Your consultant has requested a revision: {item.review_notes}
                            </p>
                          </div>
                        )}

                        {item.status === 'accepted' && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Accepted
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.xlsx,.zip,.jpg,.jpeg,.png"
          onChange={onFileChange}
        />
      </CardContent>
    </Card>
  );
}
