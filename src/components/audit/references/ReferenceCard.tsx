import { useState } from 'react';
import { format } from 'date-fns';
import { Download, Bot, Pencil, Trash2, ChevronDown, ChevronUp, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SourceBadge, OutcomeBadge } from './ReferenceBadges';
import { DeleteConfirmDialog } from '@/components/audit/DeleteConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { useDeleteAuditReference, useAnalyseAuditReference } from '@/hooks/useAuditReferences';
import type { ClientAuditReference } from '@/types/auditReferences';
import { cn } from '@/lib/utils';

interface ReferenceCardProps {
  reference: ClientAuditReference;
  onEdit: (ref: ClientAuditReference) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function ReferenceCard({ reference, onEdit }: ReferenceCardProps) {
  const [showAi, setShowAi] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useDeleteAuditReference();
  const analyseMutation = useAnalyseAuditReference();

  const handleDownload = async () => {
    const { data } = await supabase.storage
      .from('audit-references')
      .createSignedUrl(reference.file_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleAnalyse = () => {
    analyseMutation.mutate({
      id: reference.id,
      file_path: reference.file_path,
      subject_tenant_id: reference.subject_tenant_id,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({
      id: reference.id,
      file_path: reference.file_path,
      subject_tenant_id: reference.subject_tenant_id,
    });
  };

  const isAnalysing = reference.ai_status === 'pending' || reference.ai_status === 'processing' || analyseMutation.isPending;
  const canAnalyse = reference.ai_status === 'none' || reference.ai_status === 'error';
  const hasAiResults = reference.ai_status === 'complete';
  const findings = reference.ai_key_findings || [];
  const conditions = reference.ai_conditions || [];

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Header badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={reference.source} />
            <OutcomeBadge outcome={reference.audit_outcome} />
            {reference.audit_date && (
              <span className="text-sm text-muted-foreground ml-auto">
                {format(new Date(reference.audit_date), 'd MMM yyyy')}
              </span>
            )}
          </div>

          {/* Title / label */}
          <p className="font-medium">
            {reference.source_label || reference.audit_type || 'Untitled Reference'}
          </p>

          {/* Meta details */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {reference.auditor_name && <span>Auditor: {reference.auditor_name}</span>}
            {reference.standards_framework && <span>Framework: {reference.standards_framework}</span>}
          </div>

          {/* File info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{reference.file_name}</span>
            {reference.file_size && <span>({formatFileSize(reference.file_size)})</span>}
          </div>

          {/* Notes */}
          {reference.notes && (
            <p className="text-sm text-muted-foreground italic line-clamp-2">{reference.notes}</p>
          )}

          {/* AI status indicator */}
          {isAnalysing && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI is reading this document...</span>
            </div>
          )}
          {reference.ai_status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>Analysis failed — retry below</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
            {canAnalyse && (
              <Button variant="outline" size="sm" onClick={handleAnalyse} disabled={analyseMutation.isPending}>
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                {reference.ai_status === 'error' ? 'Retry AI' : 'Analyse with AI'}
              </Button>
            )}
            {hasAiResults && (
              <Button variant="ghost" size="sm" onClick={() => setShowAi(!showAi)}>
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                AI Results
                {showAi ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => onEdit(reference)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          {/* AI Results Expansion */}
          {showAi && hasAiResults && (
            <div className="mt-3 border-t pt-3 space-y-3">
              {reference.ai_summary && (
                <div className="bg-blue-50 dark:bg-blue-950 rounded-md p-3">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">🤖 AI Summary</p>
                  <p className="text-sm">{reference.ai_summary}</p>
                </div>
              )}

              {findings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Key Findings ({findings.length})
                  </p>
                  <div className="space-y-2">
                    {findings.map((f, i) => (
                      <div key={i} className="border rounded-md p-2.5 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-xs font-medium',
                            f.risk_level === 'high' || f.risk_level === 'critical'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : f.risk_level === 'medium'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          )}>
                            {f.risk_level}
                          </span>
                          <span className="font-medium">{f.standard}</span>
                        </div>
                        <p className="text-muted-foreground">{f.finding}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conditions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Conditions / Undertakings ({conditions.length})
                  </p>
                  <div className="space-y-1">
                    {conditions.map((c, i) => (
                      <div key={i} className="border rounded-md p-2.5 text-sm">
                        <p>{c.condition}</p>
                        {c.due_date && <p className="text-xs text-muted-foreground mt-1">Due: {c.due_date}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Reference"
        description="This will permanently delete this reference audit and its uploaded file."
        itemName={reference.source_label || reference.file_name}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
