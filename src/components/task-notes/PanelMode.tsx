import { useMemo, useState } from 'react';
import { addDays, format, isSameDay } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, NotebookPen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { NoteCard } from './NoteCard';
import { CarryOverBanner } from './CarryOverBanner';
import { useNotesForDate, useNotesForMonth, usePreviousDayUnfinished } from './useDailyNotes';
import { useNoteMutations } from './useNoteMutations';
import { DailyNote } from './types';

interface Props {
  userId: string;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  month: Date;
  onMonthChange: (d: Date) => void;
  onAddNote: () => void;
  onEditNote: (n: DailyNote) => void;
}

export function PanelMode({
  userId,
  selectedDate,
  onSelectDate,
  month,
  onMonthChange,
  onAddNote,
  onEditNote,
}: Props) {
  const notesQ = useNotesForDate(userId, selectedDate);
  const monthQ = useNotesForMonth(userId, month);
  const prevQ = usePreviousDayUnfinished(userId, selectedDate);
  const m = useNoteMutations(userId);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const notes = useMemo(() => notesQ.data ?? [], [notesQ.data]);
  const { done, total, pct } = useMemo(() => {
    let d = 0;
    let t = 0;
    notes.forEach((note) => note.items.forEach((item) => {
      t++;
      if (item.done) d++;
    }));
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [notes]);

  const noteDays = new Set(monthQ.data ?? []);
  const todaySelected = isSameDay(selectedDate, new Date());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-gradient-to-br from-brand-purple-500/[0.08] via-background to-brand-aqua-500/[0.08] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onSelectDate(addDays(selectedDate, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia-600">
              {todaySelected ? 'Today' : format(selectedDate, 'EEEE')}
            </div>
            <div className="mt-0.5 text-base font-semibold text-foreground">
              {format(selectedDate, 'dd MMMM yyyy')}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onSelectDate(addDays(selectedDate, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Checklist progress</span>
            <span className="font-semibold text-primary">{total ? `${pct}%` : 'No items yet'}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-light-purple-100">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-smooth motion-reduce:transition-none"
              style={{
                width: `${pct}%`,
                background: 'var(--gradient-brand, linear-gradient(90deg, hsl(var(--brand-purple-600)), hsl(var(--brand-fuchsia-600))))',
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{done} completed</span>
            <span>{Math.max(0, total - done)} remaining</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2 text-xs text-muted-foreground"
          onClick={() => setCalendarOpen((value) => !value)}
          aria-expanded={calendarOpen}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {calendarOpen ? 'Hide calendar' : 'Open calendar'}
        </Button>
        {!todaySelected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onSelectDate(new Date())}
          >
            Jump to today
          </Button>
        )}
      </div>

      {calendarOpen && (
        <div className="border-b bg-muted/20 px-1 py-2">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && onSelectDate(date)}
            month={month}
            onMonthChange={onMonthChange}
            className="pointer-events-auto w-full p-1"
            classNames={{
              months: 'flex flex-col w-full',
              month: 'space-y-2 w-full',
              table: 'w-full border-collapse',
              head_row: 'flex w-full justify-between',
              head_cell: 'text-muted-foreground rounded-md flex-1 font-normal text-[0.7rem]',
              row: 'flex w-full mt-1 justify-between',
              cell: 'h-8 flex-1 text-center text-xs p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
              day: 'h-8 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md inline-flex items-center justify-center text-xs',
            }}
            modifiers={{ hasNote: (date) => noteDays.has(format(date, 'yyyy-MM-dd')) }}
            modifiersClassNames={{
              hasNote: 'relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-purple-600',
            }}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Notes &amp; actions</div>
            <div className="text-[11px] text-muted-foreground">
              {notes.length} note{notes.length === 1 ? '' : 's'} for {format(selectedDate, 'dd MMM')}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onAddNote}
            className="h-8 rounded-full bg-brand-aqua-500 px-3 text-white shadow-sm hover:bg-brand-aqua-600"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add note
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4">
          <CarryOverBanner
            count={prevQ.data?.unfinishedCount ?? 0}
            pending={m.carryOver.isPending}
            onCarryOver={() =>
              m.carryOver.mutate({
                targetDate: selectedDate,
                sourceNotes: prevQ.data?.notes ?? [],
                targetNotes: notes,
              })
            }
          />
          {notesQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-light-purple-100 text-brand-purple-700">
                <NotebookPen className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">A clear page for the day</div>
              <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
                Capture a thought, meeting follow-up, or checklist so it is easy to pick up later.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-4 h-8 rounded-full" onClick={onAddNote}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create first note
              </Button>
            </div>
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} userId={userId} onEdit={onEditNote} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
