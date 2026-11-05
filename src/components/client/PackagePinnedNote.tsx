import { useState } from 'react';
import { Pin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { ALLOWANCE_NOTE_TAG } from '@/features/packages/allowanceAdjustment';
import { usePinnedNotes, type PinnedNoteItem } from '@/hooks/usePinnedNotes';

interface PackagePinnedNoteProps {
  tenantId: number;
  packageInstanceId: number;
}

/**
 * Pinned-note banner on a package card. Reads the tenant-wide pinned list
 * (shared react-query cache) and picks this package instance's pins, so it no
 * longer issues its own query per package card.
 */
export function PackagePinnedNote({ tenantId, packageInstanceId }: PackagePinnedNoteProps) {
  const { data: pinned = [] } = usePinnedNotes(tenantId);
  const [openNote, setOpenNote] = useState<PinnedNoteItem | null>(null);

  const notes = pinned.filter(
    (n) => n.parent_type === 'package_instance' && n.parent_id === packageInstanceId
  );
  if (notes.length === 0) return null;

  return (
    <>
      {notes.map((note) => {
        // The hours-adjustment note is maintained by adjust_package_allowance();
        // it is amber so a package whose hours differ from standard stands out.
        const isAllowance = note.tags?.includes(ALLOWANCE_NOTE_TAG) ?? false;
        return (
          <button
            key={note.id}
            type="button"
            onClick={() => setOpenNote(note)}
            className={cn(
              'flex items-start gap-2 p-2.5 rounded-lg border text-sm w-full text-left transition-colors cursor-pointer',
              isAllowance
                ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15'
                : 'border-primary/30 bg-primary/5 hover:bg-primary/10',
            )}
          >
            <Pin className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', isAllowance ? 'text-amber-600' : 'text-primary')} />
            <div className="min-w-0">
              {!isAllowance && <span className="font-medium text-primary">Pinned Note: </span>}
              <span className="font-medium text-foreground">{note.title || 'Untitled'}</span>
            </div>
          </button>
        );
      })}

      <Dialog open={openNote !== null} onOpenChange={(o) => { if (!o) setOpenNote(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              {openNote?.title || 'Untitled'}
            </DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(openNote?.note_details || '') }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
