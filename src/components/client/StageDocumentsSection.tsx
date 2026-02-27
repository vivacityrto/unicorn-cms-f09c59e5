import { useState } from 'react';
import { useStageDocuments } from '@/hooks/useStageDocuments';
import { useBulkGeneration } from '@/hooks/useBulkGeneration';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FileText, CheckCircle2, Clock, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StageDocumentsSectionProps {
  stageInstanceId: number;
  tenantId: number;
  packageId?: number;
  debug?: boolean;
  isVivacityStaff?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  generated: { label: 'Generated', variant: 'default' },
  pending: { label: 'Pending', variant: 'secondary' },
  released: { label: 'Released', variant: 'outline' },
};

export function StageDocumentsSection({ stageInstanceId, tenantId, packageId, debug, isVivacityStaff }: StageDocumentsSectionProps) {
  const { documents, loading, totalCount, refetch } = useStageDocuments({ stageInstanceId, tenantId, debug });
  const { bulkGenerate, generating, progress } = useBulkGeneration();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleBulkGenerate = async () => {
    setConfirmOpen(false);
    try {
      await bulkGenerate({ tenantId, stageInstanceId, packageId });
      refetch();
    } catch {
      // Error handled by hook toast
    }
  };

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
        No documents linked to this stage.
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
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{totalCount} total</Badge>
          {isVivacityStaff && (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generate All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Generate All Documents</AlertDialogTitle>
                  <AlertDialogDescription>
                    Generate all eligible auto-generated documents for this stage?
                    Up to {totalCount} documents will be processed. Already-generated documents will be skipped.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkGenerate}>
                    Generate All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {generating && (
        <div className="px-4 py-2 border-b bg-primary/5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating documents...
          </div>
          <Progress value={0} className="h-1.5" />
        </div>
      )}

      {progress && !generating && (
        <div className="px-4 py-2 border-b bg-primary/5 text-xs text-muted-foreground flex items-center gap-3">
          <span className="text-green-600 font-medium">{progress.generated} generated</span>
          {progress.skipped > 0 && <span>{progress.skipped} skipped</span>}
          {progress.failed > 0 && <span className="text-destructive">{progress.failed} failed</span>}
        </div>
      )}

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
