import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, startOfWeek } from 'date-fns';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PanelMode } from './task-notes/PanelMode';
import { FocusMode } from './task-notes/FocusMode';
import { NoteEditorModal } from './task-notes/NoteEditorModal';
import { ExpandedNotesModal } from './task-notes/ExpandedNotesModal';
import { useNoteMutations } from './task-notes/useNoteMutations';
import type { DailyNote, ViewMode } from './task-notes/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const STORAGE_KEY = 'unicorn:notes:view-mode';

function readInitialMode(): ViewMode {
  if (typeof window === 'undefined') return 'panel';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'focus' ? 'focus' : 'panel';
}

export default function TaskNotesSidebar({ isOpen, onClose, userId }: Props) {
  const [mode, setMode] = useState<ViewMode>(() => readInitialMode());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DailyNote | null>(null);
  const [expanded, setExpanded] = useState(false);

  const m = useNoteMutations(userId);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  // Keep week-start in sync when jumping across weeks via calendar/search.
  useEffect(() => {
    setWeekStart(startOfWeek(selectedDate, { weekStartsOn: 1 }));
    setMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

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

  const shared = useMemo(() => ({
    userId,
    selectedDate,
    onSelectDate: setSelectedDate,
    query,
    onQueryChange: setQuery,
    onAddNote: openAdd,
    onEditNote: openEdit,
  }), [userId, selectedDate, query]);

  if (!isOpen) return null;

  return (
    <>
      <aside
        className={cn(
          'w-[360px] shrink-0 border-l border-border bg-background flex flex-col',
          'h-[calc(100vh-0px)] sticky top-0 self-start max-h-screen overflow-hidden shadow-card',
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

        {/* Panel/Focus toggle */}
        <div className="px-4 py-2 border-b bg-background">
          <div
            role="tablist"
            aria-label="View mode"
            className="grid grid-cols-2 gap-1 p-1 rounded-[11px] bg-brand-light-purple-100"
          >
            {(['panel', 'focus'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'text-[12px] py-1.5 rounded-[8px]',
                  'transition-all duration-150 ease-smooth motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  mode === m
                    ? 'bg-background text-brand-acai-700 font-bold shadow-sm'
                    : 'text-brand-acai-700/70 hover:text-brand-acai-700',
                )}
              >
                {m === 'panel' ? 'Panel' : 'Focus'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          {mode === 'panel' ? (
            <PanelMode
              {...shared}
              month={month}
              onMonthChange={setMonth}
            />
          ) : (
            <FocusMode
              {...shared}
              weekStart={weekStart}
              onWeekStartChange={setWeekStart}
            />
          )}
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
