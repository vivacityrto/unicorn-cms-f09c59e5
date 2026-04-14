import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, ChevronDown, ChevronUp, Check, RotateCcw, Download, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuditEvidenceRequests, useReviewEvidenceItem } from '@/hooks/useAuditPrep';
import { SendEvidenceRequestDrawer } from './SendEvidenceRequestDrawer';
import type { ClientAudit } from '@/types/clientAudits';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface EvidenceRequestsSectionProps {
  audit: ClientAudit;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  received: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  revision_requested: 'bg-amber-100 text-amber-700',
};

export function EvidenceRequestsSection({ audit }: EvidenceRequestsSectionProps) {
  const { data: requests = [], isLoading } = useAuditEvidenceRequests(audit.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const reviewItem = useReviewEvidenceItem();
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});

  const getRequestProgress = (req: any) => {
    const items = req.items || req.evidence_request_items || [];
    const received = items.filter((i: any) => ['received', 'accepted'].includes(i.status)).length;
    return { received, total: items.length };
  };

  const getRequestStatus = (req: any) => {
    const { received, total } = getRequestProgress(req);
    if (received === 0) return { label: 'Pending', color: 'bg-gray-100 text-gray-600' };
    if (received < total) return { label: 'Partially received', color: 'bg-amber-100 text-amber-700' };
    return { label: 'Complete', color: 'bg-green-100 text-green-700' };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Evidence Requests</CardTitle>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Send Evidence Request
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No evidence requests sent yet. Send a request to ask the client to upload documents.
          </p>
        ) : (
          requests.map(req => {
            const items = (req as any).evidence_request_items || req.items || [];
            const { received, total } = getRequestProgress(req);
            const status = getRequestStatus(req);
            const isExpanded = expandedRequest === req.id;

            return (
              <Card key={req.id} className="border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{req.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Sent {req.sent_at ? format(new Date(req.sent_at), 'd MMM yyyy') : '—'}</span>
                        <span>•</span>
                        <span className={cn(req.due_date && new Date(req.due_date) < new Date() && 'text-red-600 font-medium')}>
                          Due {req.due_date ? format(new Date(req.due_date), 'd MMM yyyy') : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px]', status.color)}>{status.label}</Badge>
                      <span className="text-xs text-muted-foreground">{received} of {total} items received</span>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedRequest(isExpanded ? null : req.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {total > 0 && <Progress value={total > 0 ? (received / total) * 100 : 0} className="h-1.5" />}

                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t">
                      {items.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
                          <div className="flex items-center gap-2 flex-1">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{item.item_name}</p>
                              {item.guidance_text && <p className="text-xs text-muted-foreground">{item.guidance_text}</p>}
                            </div>
                            {item.is_required && <Badge variant="outline" className="text-[9px] ml-2">Required</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[item.status] || STATUS_COLORS.pending)}>
                              {item.status === 'revision_requested' ? 'Revision needed' : item.status}
                            </Badge>
                            {item.status === 'received' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => reviewItem.mutate({ itemId: item.id, status: 'accepted' })}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> Accept
                                </Button>
                                <div className="flex items-center gap-1">
                                  <Input
                                    placeholder="Revision note…"
                                    className="h-7 text-xs w-40"
                                    value={revisionNotes[item.id] || ''}
                                    onChange={e => setRevisionNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-amber-600 hover:text-amber-700"
                                    onClick={() => {
                                      reviewItem.mutate({ itemId: item.id, status: 'revision_requested', reviewNotes: revisionNotes[item.id] });
                                      setRevisionNotes(prev => ({ ...prev, [item.id]: '' }));
                                    }}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>

      <SendEvidenceRequestDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        audit={audit}
      />
    </Card>
  );
}
