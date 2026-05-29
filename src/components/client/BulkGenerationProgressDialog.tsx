import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Clock, Loader2, Minus, XCircle } from 'lucide-react';
import type { LiveResult, LiveStatus } from '@/hooks/useBulkGeneration';

interface Props {
  open: boolean;
  generating: boolean;
  liveResults: LiveResult[];
  currentDoc: string | null;
  completedCount: number;
  totalCount: number;
  onCancel: () => void;
  onClose: () => void;
}

const STATUS_META: Record<LiveStatus, { icon: typeof Clock; className: string; label: string; rowClass?: string }> = {
  generated: { icon: CheckCircle2, className: 'text-green-600', label: 'Generated' },
  generating: { icon: Loader2, className: 'text-blue-600 animate-spin', label: 'Generating…' },
  failed: { icon: XCircle, className: 'text-destructive', label: 'Failed' },
  skipped: { icon: Minus, className: 'text-muted-foreground', label: 'Skipped' },
  pending: { icon: Clock, className: 'text-muted-foreground', label: 'Pending', rowClass: 'opacity-60' },
};

export function BulkGenerationProgressDialog({
  open,
  generating,
  liveResults,
  currentDoc,
  completedCount,
  totalCount,
  onCancel,
  onClose,
}: Props) {
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Auto-scroll to the row currently generating
  useEffect(() => {
    if (!currentDoc) return;
    const current = liveResults.find(r => r.document_title === currentDoc && r.status === 'generating');
    if (!current) return;
    const node = rowRefs.current.get(current.document_instance_id);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentDoc, liveResults]);

  const summary = liveResults.reduce(
    (acc, r) => {
      if (r.status === 'generated') acc.generated++;
      else if (r.status === 'skipped') acc.skipped++;
      else if (r.status === 'failed') acc.failed++;
      return acc;
    },
    { generated: 0, skipped: 0, failed: 0 },
  );

  const pct = totalCount > 0 ? Math.min(100, (completedCount / totalCount) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !generating) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl"
        // Block ESC/overlay close while generating
        onEscapeKeyDown={(e) => { if (generating) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (generating) e.preventDefault(); }}
        onInteractOutside={(e) => { if (generating) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Generating Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Progress value={pct} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedCount} of {totalCount}</span>
              <span>{Math.round(pct)}%</span>
            </div>
          </div>

          {generating && currentDoc && (
            <p className="text-xs text-muted-foreground truncate">
              Currently generating: <span className="font-medium text-foreground">{currentDoc}</span>
            </p>
          )}

          <ScrollArea className="h-[min(50vh,420px)] rounded-md border">
            <div className="divide-y">
              {liveResults.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Preparing list…
                </div>
              ) : (
                liveResults.map((r) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={r.document_instance_id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.document_instance_id, el);
                        else rowRefs.current.delete(r.document_instance_id);
                      }}
                      className={`flex items-start gap-2 px-3 py-2 ${meta.rowClass ?? ''}`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.className}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{r.document_title}</p>
                        {(r.status === 'failed' || r.status === 'skipped') && (r.error || r.reason) && (
                          <p className={`text-xs truncate ${r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {r.error || r.reason}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs shrink-0 ${meta.className.replace('animate-spin', '')}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            {!generating && liveResults.length > 0 && (
              <span>
                <span className="text-green-600 font-medium">{summary.generated} generated</span>
                {summary.skipped > 0 && <>, <span>{summary.skipped} skipped</span></>}
                {summary.failed > 0 && <>, <span className="text-destructive font-medium">{summary.failed} failed</span></>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {generating ? (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
