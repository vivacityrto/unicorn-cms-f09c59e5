import { useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { NoteCard } from './NoteCard';
import { CarryOverBanner } from './CarryOverBanner';
import { SearchResultsList } from './SearchResultsList';
import { useNotesForDate, useNotesForMonth, usePreviousDayUnfinished, useSearchNotes } from './useDailyNotes';
import { useNoteMutations } from './useNoteMutations';
import { DailyNote } from './types';

interface Props {
  userId: string;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  month: Date;
  onMonthChange: (d: Date) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onAddNote: () => void;
  onEditNote: (n: DailyNote) => void;
}

export function PanelMode({
  userId,
  selectedDate,
  onSelectDate,
  month,
  onMonthChange,
  query,
  onQueryChange,
  onAddNote,
  onEditNote,
}: Props) {
  const notesQ = useNotesForDate(userId, selectedDate);
  const monthQ = useNotesForMonth(userId, month);
  const prevQ = usePreviousDayUnfinished(userId, selectedDate);
  const searchQ = useSearchNotes(userId, query);
  const m = useNoteMutations(userId);

  const notes = notesQ.data ?? [];
  const { done, total, pct } = useMemo(() => {
    let d = 0, t = 0;
    notes.forEach((n) => n.items.forEach((it) => { t++; if (it.done) d++; }));
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [notes]);

  const noteDays = new Set(monthQ.data ?? []);
  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress + Search */}
      <div className="px-4 pt-3 pb-2 border-b bg-background space-y-3">
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span className="text-muted-foreground">Today’s progress</span>
            <span className="font-semibold text-brand-acai-700">{done}/{total}</span>
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

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search notes"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {searching ? (
          <div className="p-4">
            <SearchResultsList
              results={searchQ.data ?? []}
              userId={userId}
              onEdit={onEditNote}
              isLoading={searchQ.isLoading}
              query={query}
            />
          </div>
        ) : (
          <>
            {/* Calendar */}
            <div className="px-2 py-2 border-b bg-background flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && onSelectDate(d)}
                month={month}
                onMonthChange={onMonthChange}
                className="pointer-events-auto"
                modifiers={{ hasNote: (d) => noteDays.has(format(d, 'yyyy-MM-dd')) }}
                modifiersClassNames={{
                  hasNote:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-purple-600",
                }}
              />
            </div>

            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
              <div className="text-sm font-medium text-brand-acai-700">
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

      {/* Sticky footer */}
      {!searching && notes.length > 0 && (
        <div className={cn(
          'shrink-0 border-t bg-background px-4 py-2 flex items-center justify-between gap-2',
        )}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              m.deleteCompleted.mutate({ notes, dateStr: format(selectedDate, 'yyyy-MM-dd') })
            }
          >
            Delete Completed
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-brand-fuchsia-600 hover:text-brand-fuchsia-700 hover:bg-brand-fuchsia-50"
            onClick={() => m.clearAll.mutate({ notes, dateStr: format(selectedDate, 'yyyy-MM-dd') })}
          >
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}
