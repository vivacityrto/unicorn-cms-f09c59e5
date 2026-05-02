import { useState } from 'react';
import { Pin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

interface Props {
  title: string | null;
  text: string | null;
  severity: ClientPackageDashboardRow['pinned_note_severity'];
}

const SEVERITY_CLASS: Record<NonNullable<Props['severity']>, string> = {
  info:   'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200',
  hold:   'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200',
  urgent: 'bg-red-100 border-red-300 text-red-900 hover:bg-red-200',
};

export function PinnedNoteBanner({ title, text, severity }: Props) {
  const [open, setOpen] = useState(false);

  if (!text && !title) return null;
  const sev = severity ?? 'info';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-start gap-2 w-full text-left p-3 rounded-md border transition-colors cursor-pointer',
          SEVERITY_CLASS[sev],
        )}
      >
        <Pin className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 text-sm">
          <span className="font-semibold">Pinned: </span>
          <span className="font-medium">{title || 'Pinned note'}</span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pin className="h-4 w-4" />
              {title || 'Pinned note'}
            </DialogTitle>
          </DialogHeader>
          {text && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
