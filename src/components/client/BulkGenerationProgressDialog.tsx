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
import { CheckCircle2, ChevronUp, Clock, Loader2, Minus, X, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { LiveResult, LiveStatus } from '@/hooks/useBulkGeneration';

interface Props {
  open: boolean;
  generating: boolean;
  liveResults: LiveResult[];
  currentDoc: string | null;
  completedCount: number;
  /** Total number of docs being processed (plan.length), not all docs on screen. */
  planSize: number;
  minimised: boolean;
  onMinimise: () => void;
  onExpand: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const STATUS_META: Record<LiveStatus, { icon: typeof Clock; className: string; label: string }> = {
  generated: { icon: CheckCircle2, className: 'text-green-600', label: 'Generated' },
  generating: { icon: Loader2, className: 'text-primary animate-spin', label: 'Generating…' },
  failed: { icon: XCircle, className: 'text-destructive', label: 'Failed' },
  skipped: { icon: Minus, className: 'text-muted-foreground', label: 'Skipped' },
  pending: { icon: Clock, className: 'text-muted-foreground', label: 'Pending' },
};

export function BulkGenerationProgressDialog({
  open,
  generating,
  liveResults,
  currentDoc,
  completedCount,
  planSize,
  minimised,
  onMinimise,
  onExpand,
  onCancel,
  onClose,
}: Props) {
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Auto-scroll to currently-generating item
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

  const total = planSize || liveResults.filter(r => r.status !== 'skipped' || r.reason !== 'already_generated').length;
  const pct = total > 0 ? Math.min(100, (completedCount / total) * 100) : 0;
  const complete = !generating;

  // ── Minimised floating pill ──────────────────────────────────────────
  if (open && minimised) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-background shadow-lg border px-4 py-2 text-sm">
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span>Generating… <span className="font-medium">{completedCount} of {total}</span></span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onExpand}>
              <ChevronUp className="h-4 w-4 mr-1" /> Expand
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive hover:text-destructive"
              onClick={() => { onCancel(); }}
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>
              Generation complete{' '}
              <span className="text-muted-foreground">
                · {summary.generated} generated{summary.failed > 0 && ` · ${summary.failed} failed`}
              </span>
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onExpand}>
              <ChevronUp className="h-4 w-4 mr-1" /> Expand
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open={open && !minimised}
      onOpenChange={(o) => {
        if (!o && !generating) onClose();
      }}
    >
      <DialogContent
        size="lg"
        // Block ESC/overlay close while generating
        onEscapeKeyDown={(e) => { if (generating) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (generating) e.preventDefault(); }}
        onInteractOutside={(e) => { if (generating) e.preventDefault(); }}
        // Hide the built-in close X while generating via CSS — we render our own minimise button
        className={generating ? '[&>button.absolute]:hidden' : ''}
      >
        {generating && (
          <button
            type="button"
            onClick={onMinimise}
            aria-label="Minimise"
            className="absolute right-3 top-3 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Minus className="h-4 w-4" />
            <span className="sr-only">Minimise</span>
          </button>
        )}

        <DialogHeader>
          <DialogTitle>Generating Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedCount} of {total}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} className="h-2" />
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
                  const isGenerating = r.status === 'generating';
                  const isPending = r.status === 'pending';
                  return (
                    <div
                      key={r.document_instance_id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.document_instance_id, el);
                        else rowRefs.current.delete(r.document_instance_id);
                      }}
                      className={`flex items-start gap-2 px-3 py-2 transition-colors ${
                        isGenerating ? 'bg-primary/5' : ''
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.className}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isPending ? 'text-muted-foreground' : ''}`}>
                          {r.document_title}
                        </p>
                        {(r.status === 'failed' || r.status === 'skipped') && (r.error || r.reason) && (
                          r.status === 'failed' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-xs text-destructive truncate max-w-[280px] cursor-default">
                                    {r.error || r.reason}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[320px]">
                                  <p className="text-xs break-words">{r.error || r.reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">
                              {r.error || r.reason}
                            </p>
                          )
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
            {complete && liveResults.length > 0 && (
              <span>
                <span className="text-green-600 font-medium">{summary.generated} generated</span>
                {summary.skipped > 0 && <> · <span>{summary.skipped} skipped</span></>}
                {summary.failed > 0 && <> · <span className="text-destructive font-medium">{summary.failed} failed</span></>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {generating ? (
              <>
                <Button variant="ghost" size="sm" onClick={onMinimise}>
                  Minimise
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              </>
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
