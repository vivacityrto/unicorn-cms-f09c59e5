import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeNoteHtml } from './sanitizeNoteHtml';
import { COLOR_SWATCH, DailyNote } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  note: DailyNote | null;
  onEdit: (note: DailyNote) => void;
}

export function NotePreviewModal({ open, onOpenChange, note, onEdit }: Props) {
  if (!note) return null;
  const swatch = COLOR_SWATCH[note.color];
  const bodyHtml = note.body ? sanitizeNoteHtml(note.body) : '';
  const done = note.items.filter((i) => i.done).length;
  const total = note.items.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-3 w-3 rounded-full shrink-0', swatch.dot)} aria-hidden />
            <DialogTitle className="text-xl font-bold text-brand-acai-700 truncate">
              {note.title || 'Untitled'}
            </DialogTitle>
          </div>
          <p className="text-xs text-brand-fuchsia-600 font-medium">
            {format(new Date(note.note_date), 'EEEE, dd MMMM yyyy')}
            <span className="text-muted-foreground font-normal">
              {' · '}created {format(new Date(note.created_at), 'hh:mm a')}
            </span>
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-foreground [&_a]:text-brand-aqua-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">No details added.</p>
          )}

          {total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold tracking-wider text-brand-acai-700 uppercase">
                  Checklist
                </span>
                <span className="text-xs text-muted-foreground">
                  {done}/{total} complete
                </span>
              </div>
              <ul className="space-y-2">
                {note.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center',
                        item.done
                          ? 'bg-brand-purple-600 border-brand-purple-600 text-white'
                          : 'bg-transparent border-brand-acai-300',
                      )}
                    >
                      {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span
                      className={cn(
                        'text-sm leading-5 break-words',
                        item.done ? 'line-through text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="bg-brand-aqua-500 text-white hover:bg-brand-aqua-600"
            onClick={() => {
              onOpenChange(false);
              onEdit(note);
            }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
