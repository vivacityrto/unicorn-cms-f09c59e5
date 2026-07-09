import { useEffect, useState, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { Trash2, Plus, X, Maximize2, Minimize2, Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { COLOR_SWATCH, ChecklistItem, DailyNote, NoteColor, newItemId } from './types';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: 'create' | 'edit';
  existing?: DailyNote | null;
  onSubmit: (data: { title: string; color: NoteColor; body: string; items: ChecklistItem[] }) => void;
  submitting?: boolean;
  noteDate?: Date;
}

const COLOR_ORDER: NoteColor[] = ['purple', 'aqua', 'fuchsia', 'macaron'];

export function NoteEditorModal({ open, onOpenChange, mode, existing, onSubmit, submitting, noteDate }: Props) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<NoteColor>('purple');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && existing) {
      setTitle(existing.title);
      setColor(existing.color);
      setBody(existing.body);
      setItems(existing.items.map((i) => ({ ...i })));
      setShowDetails(!!existing.body && existing.body.replace(/<[^>]*>/g, '').trim().length > 0);
      setTitleEdited(true);
    } else {
      setTitle('');
      setColor('purple');
      setBody('');
      setItems([]);
      setShowDetails(false);
      setTitleEdited(false);
    }
    setNewItemText('');
    setExpanded(false);
    setEditorExpanded(false);
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

  const buildAiContent = (): string => {
    const plain = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const checklist = items.map((it) => `- ${it.text}`).filter((s) => s.trim() !== '-').join('\n');
    return [plain, checklist].filter(Boolean).join('\n\n');
  };

  const generateTitle = async (): Promise<string> => {
    const content = buildAiContent();
    if (!content) return '';
    try {
      const { data, error } = await supabase.functions.invoke('extract-note-title', { body: { content } });
      if (error) return '';
      return (data?.title || '').trim();
    } catch {
      return '';
    }
  };

  const handleGenerateTitleClick = async () => {
    setGeneratingTitle(true);
    const t = await generateTitle();
    if (t) {
      setTitle(t);
      setTitleEdited(false);
    }
    setGeneratingTitle(false);
  };

  const handleSave = async () => {
    let finalTitle = title.trim();
    if (!finalTitle && !titleEdited) {
      setGeneratingTitle(true);
      finalTitle = await generateTitle();
      setGeneratingTitle(false);
      if (finalTitle) setTitle(finalTitle);
    }
    onSubmit({ title: finalTitle, color, body, items });
  };

  const displayDate = existing ? new Date(existing.note_date) : (noteDate ?? new Date());
  const dateLabel = format(displayDate, 'EEEE, dd MMMM yyyy');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 bg-background shadow-lg duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            expanded
              ? 'inset-4 rounded-lg flex flex-col'
              : 'left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[92vw] max-w-[720px] max-h-[90vh] rounded-lg flex flex-col',
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b shrink-0">
            <div>
              <h2 className="text-xl font-bold text-brand-acai-700">
                {mode === 'edit' ? 'Edit Note' : 'Create Note'}
              </h2>
              <p className="text-xs text-brand-fuchsia-600 mt-0.5 font-medium">{dateLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? 'Collapse modal' : 'Expand modal'}
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Title */}
            <div className="flex items-end gap-2">
              <Input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
                placeholder="Note title (auto-generated if left blank)"
                className={cn(
                  'flex-1 border-0 border-b border-border rounded-none px-0 text-2xl font-bold h-auto py-2',
                  'placeholder:text-muted-foreground/60',
                  'focus-visible:ring-0 focus-visible:border-brand-aqua-500',
                )}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerateTitleClick}
                disabled={generatingTitle || (!body && items.length === 0)}
                className="h-8 gap-1.5 text-xs text-brand-fuchsia-600 hover:text-brand-fuchsia-700 hover:bg-brand-fuchsia-50 shrink-0"
                title="Generate title with AI"
              >
                {generatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI title
              </Button>
            </div>

            {/* Label / color */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold tracking-wider text-brand-acai-700 uppercase">Label</span>
              <div className="flex items-center gap-2">
                {COLOR_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`${COLOR_SWATCH[c].label} label`}
                    aria-pressed={color === c}
                    className={cn(
                      'h-7 w-7 rounded-md transition-all duration-150 ease-smooth motion-reduce:transition-none',
                      COLOR_SWATCH[c].dot,
                      color === c
                        ? 'ring-2 ring-offset-2 ring-brand-acai-700 scale-105'
                        : 'opacity-80 hover:opacity-100',
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Rich body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <button
                  type="button"
                  onClick={() => setShowDetails((s) => !s)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-brand-acai-700 uppercase hover:text-brand-aqua-600"
                >
                  {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Details
                  {!showDetails && <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground">(hidden)</span>}
                </button>
                {showDetails && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-brand-aqua-600 hover:text-brand-aqua-700"
                    onClick={() => setEditorExpanded((e) => !e)}
                  >
                    {editorExpanded ? (
                      <><Minimize2 className="h-3 w-3 mr-1" />Collapse editor</>
                    ) : (
                      <><Maximize2 className="h-3 w-3 mr-1" />Expand editor</>
                    )}
                  </Button>
                )}
              </div>
              {showDetails && (
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Write details, paste links, format text…"
                  minHeight={editorExpanded ? '420px' : '160px'}
                />
              )}
            </div>

            {/* Checklist */}
            <div>
              <span className="text-[11px] font-bold tracking-wider text-brand-acai-700 uppercase">Checklist</span>
              <ul className="mt-2 space-y-0.5">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="group flex items-center gap-3 py-1"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={it.done}
                      onClick={() => updateItem(it.id, { done: !it.done })}
                      className={cn(
                        'h-4 w-4 rounded-full border-[1.5px] shrink-0 transition-colors flex items-center justify-center',
                        it.done
                          ? 'bg-brand-purple-600 border-brand-purple-600'
                          : 'border-brand-acai-300 hover:border-brand-purple-600',
                      )}
                    >
                      {it.done && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                    <Input
                      value={it.text}
                      onChange={(e) => updateItem(it.id, { text: e.target.value })}
                      placeholder="List item"
                      className={cn(
                        'h-7 text-sm border-0 shadow-none px-0 bg-transparent text-brand-acai-700',
                        'focus-visible:ring-0',
                        it.done && 'line-through text-muted-foreground',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove item"
                      className="text-muted-foreground hover:text-brand-fuchsia-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { id: newItemId(), text: '', done: false }])}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-aqua-600 hover:text-brand-aqua-700"
              >
                <Plus className="h-4 w-4" />
                Add item
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
