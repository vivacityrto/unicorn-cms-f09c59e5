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

function deriveBannerMessage(severity: 'hold' | 'urgent' | 'info' | null): string {
  switch (severity) {
    case 'hold':
      return 'Package on hold. All client activity is currently paused. Contact your CSC to resume.';
    case 'urgent':
      return 'Action required on this package. Open the note for details.';
    case 'info':
    default:
      return 'There is a pinned note on this package. Open it for details.';
  }
}

export function PinnedNoteBanner({ title, text, severity }: Props) {
  const [open, setOpen] = useState(false);

  if (!text && !title) return null;

  const isUrgent = severity === 'urgent';
  const containerClass = isUrgent
    ? 'bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 hover:bg-red-100 dark:hover:bg-red-950/50'
    : 'bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500 hover:bg-amber-100 dark:hover:bg-amber-950/50';
  const iconClass = isUrgent ? 'text-red-600' : 'text-amber-600';

  const message = deriveBannerMessage(severity);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-start gap-2 w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer',
          containerClass,
        )}
      >
        <Pin className={cn('h-4 w-4 shrink-0 mt-0.5', iconClass)} />
        <div className="min-w-0 text-sm font-medium text-foreground">{message}</div>
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
