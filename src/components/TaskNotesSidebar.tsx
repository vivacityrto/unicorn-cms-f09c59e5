import { useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PanelMode } from './task-notes/PanelMode';
import { NoteEditorModal } from './task-notes/NoteEditorModal';
import { ExpandedNotesModal } from './task-notes/ExpandedNotesModal';
import { useNoteMutations } from './task-notes/useNoteMutations';
import type { DailyNote } from './task-notes/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function TaskNotesSidebar({ isOpen, onClose, userId }: Props) {
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

  if (!isOpen) return null;

  return (
    <>
      <aside
        className={cn(
          'w-[360px] shrink-0 border-l border-border bg-background flex flex-col',
          'h-[calc(100vh-0px)] sticky top-0 self-start max-h-screen overflow-hidden shadow-elevated',
        )}
        aria-label="Daily Notes"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <h2 className="text-sm font-semibold text-brand-acai-700">Daily Notes</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(true)}
              aria-label="Expand notes to workspace"
              title="Expand"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              aria-label="Close notes panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
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
      </aside>

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
