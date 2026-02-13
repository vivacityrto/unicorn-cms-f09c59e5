import { useStageDocuments } from '@/hooks/useStageDocuments';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, Clock, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StageDocumentsSectionProps {
  stageInstanceId: number;
  tenantId: number;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  generated: { label: 'Generated', variant: 'default' },
  pending: { label: 'Pending', variant: 'secondary' },
  released: { label: 'Released', variant: 'outline' },
};

export function StageDocumentsSection({ stageInstanceId, tenantId }: StageDocumentsSectionProps) {
  const { documents, loading, totalCount } = useStageDocuments({ stageInstanceId, tenantId });

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-3 border-t bg-muted/20">
        <Skeleton className="h-4 w-24" />
        {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="px-4 py-3 border-t bg-muted/20 text-center text-muted-foreground text-sm">
        No documents linked to this phase.
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/20">
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Documents
        </span>
        <Badge variant="outline" className="text-xs">{totalCount} total</Badge>
      </div>
      <div className="divide-y">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-2">
            {doc.isgenerated ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{doc.title}</p>
              {doc.created_at && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(doc.created_at), 'dd MMM yyyy')}
                </p>
              )}
            </div>
            <Badge variant={STATUS_BADGE[doc.status]?.variant || 'secondary'} className="text-xs">
              {STATUS_BADGE[doc.status]?.label || doc.status}
            </Badge>
          </div>
        ))}
      </div>
      {totalCount > 10 && (
        <div className="px-4 py-2 border-t text-center">
          <button className="text-xs text-primary hover:underline">
            View all {totalCount} documents
          </button>
        </div>
      )}
    </div>
  );
}
