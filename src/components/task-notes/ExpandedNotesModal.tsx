import { useMemo } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { NoteCard } from './NoteCard';
import { CarryOverBanner } from './CarryOverBanner';
import { SearchResultsList } from './SearchResultsList';
import { useNotesForDate, useNotesForMonth, usePreviousDayUnfinished, useSearchNotes } from './useDailyNotes';
import { useNoteMutations } from './useNoteMutations';
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

export function ExpandedNotesModal({
  open, onOpenChange, userId, selectedDate, onSelectDate,
  month, onMonthChange, query, onQueryChange, onAddNote, onEditNote,
}: Props) {
  const notesQ = useNotesForDate(userId, selectedDate, open);
  const monthQ = useNotesForMonth(userId, month, open);
  const prevQ = usePreviousDayUnfinished(userId, selectedDate, open);
  const searchQ = useSearchNotes(userId, query, open);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden">
        <div className="grid grid-cols-[340px_1fr] h-full min-h-0">
          {/* Left pane */}
          <aside className="border-r bg-muted/20 flex flex-col min-h-0">
            <div className="p-4 border-b bg-background space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold text-brand-acai-700">{done}/{total} · {pct}%</span>
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
              <div className="p-2 flex justify-center border-b bg-background">
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
              <div className="p-4">
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
              </div>
            </div>
          </aside>

          {/* Right pane */}
          <section className="flex flex-col min-h-0">
            <header className="px-6 py-4 border-b bg-background flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-acai-700">
                {searching ? `Search: “${query}”` : format(selectedDate, 'EEEE, dd MMM yyyy')}
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={onAddNote}
                className="h-8 bg-brand-aqua-500 text-white hover:bg-brand-aqua-600"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Note
              </Button>
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
              ) : notes.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-12">
                  No notes for this date.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {notes.map((n) => (
                    <NoteCard key={n.id} note={n} userId={userId} onEdit={onEditNote} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
