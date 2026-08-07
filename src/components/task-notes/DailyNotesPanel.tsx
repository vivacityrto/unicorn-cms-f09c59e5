import { useState } from 'react';
import { startOfMonth } from 'date-fns';
import { Maximize2, NotebookPen } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PanelMode } from './PanelMode';
import { NoteEditorModal } from './NoteEditorModal';
import { ExpandedNotesModal } from './ExpandedNotesModal';
import { useNoteMutations } from './useNoteMutations';
import type { DailyNote } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

// Global entry point for Daily Notes, mounted in TopBar so it's reachable
// from every page — not just the Tasks page it originally lived on.
export function DailyNotesPanel({ open, onOpenChange, userId }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DailyNote | null>(null);
  const [expanded, setExpanded] = useState(false);

  const m = useNoteMutations(userId);

  const openAdd = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (n: DailyNote) => { setEditing(n); setEditorOpen(true); };
  const openExpanded = () => {
    onOpenChange(false);
    setExpanded(true);
  };

  const handleSubmit = (data: { title: string; color: DailyNote['color']; body: string; items: DailyNote['items'] }) => {
    if (editing) {
      m.updateNote.mutate(
        { id: editing.id, userId, date: new Date(editing.note_date), ...data },
        { onSuccess: () => setEditorOpen(false) },
      );
    } else {
      m.createNote.mutate(
        { userId, date: selectedDate, ...data },
        { onSuccess: () => setEditorOpen(false) },
      );
    }
  };

  const submitting = m.createNote.isPending || m.updateNote.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col border-l border-border/70 p-0 sm:max-w-md">
          <SheetHeader className="border-b bg-background px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple-600 to-brand-fuchsia-600 text-white shadow-sm">
                  <NotebookPen className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base">Daily Notes</SheetTitle>
                  <p className="text-[11px] text-muted-foreground">Your private daily workspace</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mr-6 h-8 gap-1.5 rounded-full px-3 text-xs"
                onClick={openExpanded}
                title="Expand notes to workspace"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Workspace
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 min-h-0">
            <PanelMode
              userId={userId}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              month={month}
              onMonthChange={setMonth}
              onAddNote={openAdd}
              onEditNote={openEdit}
            />
          </div>
        </SheetContent>
      </Sheet>

      <NoteEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editing ? 'edit' : 'create'}
        existing={editing}
        noteDate={selectedDate}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <ExpandedNotesModal
        open={expanded}
        onOpenChange={setExpanded}
        userId={userId}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        month={month}
        onMonthChange={setMonth}
        query={query}
        onQueryChange={setQuery}
        onAddNote={() => { setExpanded(false); openAdd(); }}
        onEditNote={(n) => { setExpanded(false); openEdit(n); }}
      />
    </>
  );
}
