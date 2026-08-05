import { useMemo } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
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

  const notes = notesQ.data ?? [];
  const { done, total, pct } = useMemo(() => {
    let d = 0, t = 0;
    notes.forEach((n) => n.items.forEach((it) => { t++; if (it.done) d++; }));
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [notes]);

  const noteDays = new Set(monthQ.data ?? []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress */}
      <div className="px-4 pt-3 pb-2 border-b bg-background">
        <div className="flex items-center justify-between text-[12px] mb-1">
          <span className="text-muted-foreground">Today’s progress</span>
          <span className="font-semibold text-primary">{done}/{total}</span>
        </div>
        <div className="h-2 rounded-full bg-brand-light-purple-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-smooth motion-reduce:transition-none"
            style={{
              width: `${pct}%`,
              background: 'var(--gradient-brand, linear-gradient(90deg, hsl(var(--brand-purple-600)), hsl(var(--brand-fuchsia-600))))',
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {(
          <>

            {/* Calendar */}
            <div className="px-1 py-2 border-b bg-background">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && onSelectDate(d)}
                month={month}
                onMonthChange={onMonthChange}
                className="pointer-events-auto p-1 w-full"
                classNames={{
                  months: "flex flex-col w-full",
                  month: "space-y-2 w-full",
                  table: "w-full border-collapse",
                  head_row: "flex w-full justify-between",
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.7rem]",
                  row: "flex w-full mt-1 justify-between",
                  cell: "h-8 flex-1 text-center text-xs p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-8 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md inline-flex items-center justify-center text-xs",
                }}
                modifiers={{ hasNote: (d) => noteDays.has(format(d, 'yyyy-MM-dd')) }}
                modifiersClassNames={{
                  hasNote:
                    "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-purple-600",
                }}
              />
            </div>

            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
              <div className="text-sm font-medium text-primary">
                Notes for {format(selectedDate, 'EEE, dd MMM')}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={onAddNote}
                className="h-8 bg-brand-aqua-500 text-white hover:bg-brand-aqua-600"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Note
              </Button>
            </div>

            <div className="p-4 space-y-3">
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
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : notes.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No notes for this date.
                </div>
              ) : (
                notes.map((n) => (
                  <NoteCard key={n.id} note={n} userId={userId} onEdit={onEditNote} />
                ))
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
