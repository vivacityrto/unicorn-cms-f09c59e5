import { useEffect, useState, KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { Trash2, Plus } from 'lucide-react';
import { COLOR_SWATCH, ChecklistItem, DailyNote, NoteColor, newItemId } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: 'create' | 'edit';
  existing?: DailyNote | null;
  onSubmit: (data: { title: string; color: NoteColor; body: string; items: ChecklistItem[] }) => void;
  submitting?: boolean;
}

const COLOR_ORDER: NoteColor[] = ['purple', 'aqua', 'fuchsia', 'macaron'];

export function NoteEditorModal({ open, onOpenChange, mode, existing, onSubmit, submitting }: Props) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<NoteColor>('purple');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && existing) {
      setTitle(existing.title);
      setColor(existing.color);
      setBody(existing.body);
      setItems(existing.items.map((i) => ({ ...i })));
    } else {
      setTitle('');
      setColor('purple');
      setBody('');
      setItems([]);
    }
    setNewItemText('');
  }, [open, mode, existing]);

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const addItem = (text?: string) => {
    const t = (text ?? newItemText).trim();
    if (!t) return;
    setItems((prev) => [...prev, { id: newItemId(), text: t, done: false }]);
    setNewItemText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  const handleSave = () => {
    onSubmit({ title, color, body, items });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-brand-acai-700">
            {mode === 'edit' ? 'Edit Note' : 'Add Note'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className={cn(
                'border-0 border-b-2 border-border rounded-none px-0 text-lg font-semibold',
                'focus-visible:ring-0 focus-visible:border-brand-aqua-500',
              )}
              autoFocus
            />
          </div>

          {/* Color swatches */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Label</span>
            {COLOR_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`${COLOR_SWATCH[c].label} label`}
                aria-pressed={color === c}
                className={cn(
                  'h-6 w-6 rounded-full transition-all duration-150 ease-smooth motion-reduce:transition-none',
                  COLOR_SWATCH[c].dot,
                  color === c ? 'ring-2 ring-offset-2 ring-brand-acai-700' : 'opacity-80 hover:opacity-100',
                )}
              />
            ))}
          </div>

          {/* Rich body */}
          <div>
            <label className="text-xs text-muted-foreground">Details</label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Write details, paste links, format text…"
              minHeight="140px"
              className="mt-1"
            />
          </div>

          {/* Checklist editor */}
          <div>
            <label className="text-xs text-muted-foreground">Checklist</label>
            <ul className="mt-2 space-y-2">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={(e) => updateItem(it.id, { done: e.target.checked })}
                    className="h-4 w-4 accent-brand-purple-600"
                  />
                  <Input
                    value={it.text}
                    onChange={(e) => updateItem(it.id, { text: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-brand-fuchsia-600"
                    onClick={() => removeItem(it.id)}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border border-dashed border-brand-acai-300 shrink-0" aria-hidden />
                <Input
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Add item"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => addItem()}
                  disabled={!newItemText.trim()}
                  aria-label="Add checklist item"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="bg-brand-aqua-500 text-white hover:bg-brand-aqua-600"
          >
            Save Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
