import { useState } from 'react';
import { startOfMonth } from 'date-fns';
import { Maximize2 } from 'lucide-react';
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
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>Daily Notes</SheetTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setExpanded(true)}
                title="Expand notes to workspace"
              >
                <Maximize2 className="h-3 w-3" />
                Expand
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
