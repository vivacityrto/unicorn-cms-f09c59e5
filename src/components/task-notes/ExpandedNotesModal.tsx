import { useMemo, useState } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { Plus, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';

import { NoteCard } from './NoteCard';
import { CarryOverBanner } from './CarryOverBanner';
import { SearchResultsList } from './SearchResultsList';
import {
  useNotesForDate,
  useNotesForMonth,
  useNotesForRange,
  usePreviousDayUnfinished,
  useSearchNotes,
} from './useDailyNotes';
import { useNoteMutations } from './useNoteMutations';
import { useNotesSummary, type RangeMode } from './useNotesSummary';
import type { DailyNote } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
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

function computeRange(mode: RangeMode, date: Date): { from: Date; to: Date; label: string } {
  if (mode === 'day') {
    return { from: date, to: date, label: format(date, 'EEEE, dd MMM yyyy') };
  }
  if (mode === 'week') {
    const from = startOfWeek(date, { weekStartsOn: 1 });
    const to = endOfWeek(date, { weekStartsOn: 1 });
    return {
      from,
      to,
      label: `Week of ${format(from, 'dd MMM')} – ${format(to, 'dd MMM yyyy')}`,
    };
  }
  const from = startOfMonth(date);
  const to = endOfMonth(date);
  return { from, to, label: format(from, 'MMMM yyyy') };
}

function computeStats(notes: DailyNote[]) {
  let done = 0;
  let total = 0;
  const dayKeys = new Set<string>();
  for (const n of notes) {
    dayKeys.add(n.note_date);
    for (const it of n.items) {
      total++;
      if (it.done) done++;
    }
  }
  return { noteCount: notes.length, done, total, daysWithNotes: dayKeys.size };
}

export function ExpandedNotesModal({
  open, onOpenChange, userId, selectedDate, onSelectDate,
  month, onMonthChange, query, onQueryChange, onAddNote, onEditNote,
}: Props) {
  const [rangeMode, setRangeMode] = useState<RangeMode>('day');

  const notesQ = useNotesForDate(userId, selectedDate, open && rangeMode === 'day');
  const range = useMemo(() => computeRange(rangeMode, selectedDate), [rangeMode, selectedDate]);
  const rangeFromStr = format(range.from, 'yyyy-MM-dd');
  const rangeToStr = format(range.to, 'yyyy-MM-dd');
  const rangeQ = useNotesForRange(
    userId,
    rangeFromStr,
    rangeToStr,
    open && rangeMode !== 'day',
  );

  const monthQ = useNotesForMonth(userId, month, open);
  const prevQ = usePreviousDayUnfinished(userId, selectedDate, open);
  const searchQ = useSearchNotes(userId, query, open);
  const m = useNoteMutations(userId);

  const dayNotes = notesQ.data ?? [];
  const rangeNotes = rangeQ.data ?? [];
  const periodNotes = rangeMode === 'day' ? dayNotes : rangeNotes;

  const stats = useMemo(() => computeStats(periodNotes), [periodNotes]);
  const daysInPeriod = differenceInCalendarDays(range.to, range.from) + 1;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  const grouped = useMemo(() => {
    if (rangeMode === 'day') return null;
    const map = new Map<string, DailyNote[]>();
    for (const n of rangeNotes) {
      const list = map.get(n.note_date) ?? [];
      list.push(n);
      map.set(n.note_date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rangeMode, rangeNotes]);

  const noteDays = new Set(monthQ.data ?? []);
  const searching = query.trim().length > 0;

  const summary = useNotesSummary({
    userId,
    rangeMode,
    periodStart: rangeFromStr,
    periodEnd: rangeToStr,
    periodLabel: range.label,
    notes: periodNotes,
  });

  const canSummarize = periodNotes.length > 0 && !summary.isFetching;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden">
        <div className="grid grid-cols-[340px_1fr] h-full min-h-0">
          {/* Left pane */}
          <aside className="border-r bg-muted/20 flex flex-col min-h-0">
            <div className="p-4 border-b bg-background space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold text-primary">{stats.done}/{stats.total} · {pct}%</span>
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
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search notes"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-2 py-3 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && onSelectDate(d)}
                  month={month}
                  onMonthChange={onMonthChange}
                  className="pointer-events-auto p-0"
                  modifiers={{ hasNote: (d) => noteDays.has(format(d, 'yyyy-MM-dd')) }}
                  modifiersClassNames={{
                    hasNote:
                      "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-purple-600",
                  }}
                />
              </div>
            </div>
          </aside>


          {/* Right pane */}
          <section className="flex flex-col min-h-0">
            <header className="px-6 py-4 border-b bg-background flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-primary">
                {searching ? `Search: "${query}"` : range.label}
              </h2>
              <div className="flex items-center gap-2">
                {!searching && (
                  <>
                    <div
                      role="tablist"
                      aria-label="Range"
                      className="inline-flex items-center h-9 rounded-lg border bg-muted/40 p-0.5"
                    >
                      {(['day', 'week', 'month'] as RangeMode[]).map((mode) => {
                        const active = rangeMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setRangeMode(mode)}
                            className={
                              'h-8 min-w-[64px] px-3 rounded-md text-xs font-medium capitalize transition-colors ' +
                              (active
                                ? 'bg-background text-primary shadow-sm'
                                : 'text-muted-foreground hover:text-foreground')
                            }
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={summary.generate}
                      disabled={!canSummarize}
                      className="h-9 min-w-[112px] px-3 text-xs font-medium"
                    >
                      {summary.isFetching ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Summarise
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  onClick={onAddNote}
                  className="h-9 min-w-[112px] px-3 text-xs font-medium bg-brand-aqua-500 text-white hover:bg-brand-aqua-600"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Note
                </Button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              {searching ? (
                <SearchResultsList
                  results={searchQ.data ?? []}
                  userId={userId}
                  onEdit={onEditNote}
                  isLoading={searchQ.isLoading}
                  query={query}
                />
              ) : (
                <>
                  {(prevQ.data?.unfinishedCount ?? 0) > 0 && rangeMode === 'day' && (
                    <div className="mb-4">
                      <CarryOverBanner
                        count={prevQ.data?.unfinishedCount ?? 0}
                        pending={m.carryOver.isPending}
                        onCarryOver={() =>
                          m.carryOver.mutate({
                            targetDate: selectedDate,
                            sourceNotes: prevQ.data?.notes ?? [],
                            targetNotes: dayNotes,
                          })
                        }
                      />
                    </div>
                  )}

                  {/* Stat strip */}
                  {rangeMode !== 'day' && (
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <StatTile label="Notes" value={String(stats.noteCount)} />
                      <StatTile
                        label="Checklist items"
                        value={`${stats.done}/${stats.total}`}
                        sub={stats.total ? `${pct}% done` : undefined}
                      />
                      <StatTile
                        label="Days with notes"
                        value={`${stats.daysWithNotes}/${daysInPeriod}`}
                      />
                    </div>
                  )}

                  {/* Summary card */}
                  {summary.hasResult && summary.data && (
                    <div className="mb-5 rounded-lg border border-brand-purple-500/30 bg-card bg-gradient-to-br from-brand-purple-500/10 to-transparent p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          {summary.data.headline}
                        </h3>
                        <button
                          type="button"
                          onClick={summary.regenerate}
                          disabled={summary.isFetching}
                          className="text-xs text-primary hover:text-[#ED1878] inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {summary.isFetching ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Regenerate
                        </button>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {summary.data.summary}
                      </p>
                      {summary.data.open_count > 0 && (
                        <div className="mt-3 inline-flex items-center rounded-full bg-brand-fuchsia-100 text-brand-fuchsia-700 text-xs font-medium px-2.5 py-0.5">
                          {summary.data.open_count} still open
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feed */}
                  {rangeMode === 'day' ? (
                    dayNotes.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-12">
                        No notes for this date.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {dayNotes.map((n) => (
                          <NoteCard key={n.id} note={n} userId={userId} onEdit={onEditNote} />
                        ))}
                      </div>
                    )
                  ) : grouped && grouped.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-12">
                      No notes in this period.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {grouped!.map(([dateStr, dayList]) => {
                        const dayStats = computeStats(dayList);
                        return (
                          <div key={dateStr}>
                            <div className="flex items-center justify-between mb-2 pb-1 border-b">
                              <h4 className="text-sm font-semibold text-primary">
                                {format(new Date(dateStr + 'T00:00:00'), 'EEEE, dd MMM yyyy')}
                              </h4>
                              {dayStats.total > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {dayStats.done}/{dayStats.total}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {dayList.map((n) => (
                                <NoteCard key={n.id} note={n} userId={userId} onEdit={onEditNote} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-primary">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
