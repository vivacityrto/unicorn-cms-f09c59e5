import { useMemo } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  weekStart: Date;
  onWeekStartChange: (d: Date) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onAddNote: () => void;
  onEditNote: (n: DailyNote) => void;
}

export function FocusMode({
  userId,
  selectedDate,
  onSelectDate,
  weekStart,
  onWeekStartChange,
  query,
  onQueryChange,
  onAddNote,
  onEditNote,
}: Props) {
  const notesQ = useNotesForDate(userId, selectedDate);
  const monthQ = useNotesForMonth(userId, selectedDate);
  const prevQ = usePreviousDayUnfinished(userId, selectedDate);
  const searchQ = useSearchNotes(userId, query);
  const m = useNoteMutations(userId);

  const notes = notesQ.data ?? [];
  const { done, total, pct } = useMemo(() => {
    let d = 0, t = 0;
    notes.forEach((n) => n.items.forEach((it) => { t++; if (it.done) d++; }));
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [notes]);

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const noteDays = new Set(monthQ.data ?? []);
  const today = new Date();
  const searching = query.trim().length > 0;

  const size = 96;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress ring + date */}
      <div className="px-4 pt-4 pb-3 border-b bg-background flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <linearGradient id="notes-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand-purple-600))" />
                <stop offset="100%" stopColor="hsl(var(--brand-fuchsia-600))" />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="hsl(var(--brand-light-purple-100))"
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="url(#notes-ring)"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${circ - dash}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-[stroke-dasharray] duration-300 ease-smooth motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">{pct}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">
            {done} of {total} done
          </div>
          <div className="text-[15px] font-semibold text-primary">
            {format(selectedDate, 'EEEE, dd MMM')}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b bg-background">
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

      {searching ? (
        <div className="flex-1 overflow-y-auto p-4">
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
          {/* Week strip */}
          <div className="px-2 py-3 border-b bg-background flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onWeekStartChange(addWeeks(weekStart, -1))}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 grid grid-cols-7 gap-1">
              {week.map((d) => {
                const isSelected = isSameDay(d, selectedDate);
                const isToday = isSameDay(d, today);
                const hasNote = noteDays.has(format(d, 'yyyy-MM-dd'));
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => onSelectDate(d)}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-md py-1.5 text-[11px]',
                      'transition-colors duration-150 ease-smooth motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isSelected
                        ? 'bg-brand-aqua-500 text-white'
                        : isToday
                          ? 'border border-primary text-primary'
                          : 'hover:bg-brand-light-purple-100 text-primary',
                    )}
                  >
                    <span className="uppercase tracking-wider opacity-80">{format(d, 'EEE')}</span>
                    <span className="text-[15px] font-semibold">{format(d, 'd')}</span>
                    <span
                      className={cn(
                        'h-1 w-1 rounded-full mt-0.5',
                        hasNote ? (isSelected ? 'bg-white' : 'bg-brand-purple-600') : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onWeekStartChange(addWeeks(weekStart, 1))}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Add + list */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
            <div className="text-sm font-medium text-primary">Tasks &amp; notes</div>
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
  );
}

// keep the util import surface tidy
export { startOfWeek };
