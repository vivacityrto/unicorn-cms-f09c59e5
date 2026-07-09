import { useState, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { sanitizeNoteHtml } from './sanitizeNoteHtml';
import { COLOR_SWATCH, DailyNote } from './types';
import { useNoteMutations } from './useNoteMutations';
import { NotePreviewModal } from './NotePreviewModal';

interface Props {
  note: DailyNote;
  userId: string;
  onEdit: (note: DailyNote) => void;
  showDateChip?: boolean;
}

export function NoteCard({ note, userId, onEdit, showDateChip }: Props) {
  const [newItem, setNewItem] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const m = useNoteMutations(userId);
  const swatch = COLOR_SWATCH[note.color];

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    m.addItem(note, newItem);
    setNewItem('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  const bodyHtml = note.body ? sanitizeNoteHtml(note.body) : '';

  const handleCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"]')) return;
    setPreviewOpen(true);
  };

  return (
    <>
    <article
      onClick={handleCardClick}
      className={cn(
        'group bg-card border border-border rounded-[var(--radius)] p-4 cursor-pointer',
        'shadow-card hover:shadow-card-hover transition-shadow duration-200 ease-smooth motion-reduce:transition-none',
      )}
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', swatch.dot)} aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {note.title ? (
                <h3 className="text-[15px] font-semibold text-brand-acai-700 truncate">
                  {note.title}
                </h3>
              ) : (
                <h3 className="text-[15px] font-medium text-muted-foreground italic">Untitled</h3>
              )}
              {showDateChip && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-brand-light-purple-100 text-brand-acai-700">
                  {format(new Date(note.note_date), 'dd MMM')}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {format(new Date(note.created_at), 'hh:mm a')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity motion-reduce:transition-none">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(note)}
            title="Edit note"
            aria-label="Edit note"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-brand-fuchsia-600 hover:text-brand-fuchsia-700"
            onClick={() => m.deleteNote.mutate({ id: note.id, note_date: note.note_date })}
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {bodyHtml && (
        <div
          className="prose prose-sm max-w-none mb-2 text-[14px] text-foreground [&_a]:text-brand-aqua-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      )}

      {note.items.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {note.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => m.toggleItem(note, item.id)}
                aria-pressed={item.done}
                aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center',
                  'transition-colors duration-150 ease-smooth motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  item.done
                    ? 'bg-brand-purple-600 border-brand-purple-600 text-white'
                    : 'bg-transparent border-brand-acai-300 hover:border-brand-purple-600',
                )}
              >
                {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  'text-[14px] leading-5 break-words',
                  item.done ? 'line-through text-muted-foreground' : 'text-foreground',
                )}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add item"
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={handleAddItem}
          disabled={!newItem.trim()}
          aria-label="Add checklist item"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
