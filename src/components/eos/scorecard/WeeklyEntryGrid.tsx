import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import type { MeasurableWithEntries } from '@/types/seatScorecard';
import { COMPARISON_SYMBOLS, getWeekStartDate } from '@/types/seatScorecard';

interface WeeklyEntryGridProps {
  measurable: MeasurableWithEntries;
  canEnter: boolean;
  onAddEntry: (measurableId: string, weekStartDate: string, value: number, notes?: string) => void;
}

export function WeeklyEntryGrid({
  measurable,
  canEnter,
  onAddEntry,
}: WeeklyEntryGridProps) {
  const [newValue, setNewValue] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Generate last 13 weeks
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const weekDate = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
    return format(weekDate, 'yyyy-MM-dd');
  }).reverse();

  const getEntryForWeek = (weekDate: string) => {
    return measurable.entries.find(e => e.week_start_date === weekDate);
  };

  const thisWeek = getWeekStartDate();
  const hasThisWeekEntry = getEntryForWeek(thisWeek);

  const handleAddEntry = () => {
    if (!newValue.trim()) return;
    onAddEntry(measurable.id, thisWeek, parseFloat(newValue), newNotes || undefined);
    setNewValue('');
    setNewNotes('');
  };

  const isOffTrack = (entry: { status: string }) => entry.status === 'Off Track';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{measurable.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Target: {COMPARISON_SYMBOLS[measurable.comparison_type]} {measurable.target_value}
              {measurable.unit && ` ${measurable.unit}`}
            </p>
          </div>
          {measurable.latestEntry && (
            <Badge variant={measurable.latestEntry.status === 'On Track' ? 'default' : 'destructive'}>
              {measurable.latestEntry.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Entry Form (only if no entry for this week) */}
        {canEnter && !hasThisWeekEntry && (
          <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
            <Input
              type="number"
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-24"
            />
            <Input
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleAddEntry}
              disabled={!newValue.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Record
            </Button>
          </div>
        )}

        {/* 13-Week Grid */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {weeks.map((weekDate) => {
              const entry = getEntryForWeek(weekDate);
              const isOff = entry ? isOffTrack(entry) : false;
              const isThisWeek = weekDate === thisWeek;
              
              return (
                <div
                  key={weekDate}
                  className={cn(
                    "flex-1 min-w-[70px] p-2 rounded border text-center",
                    entry
                      ? isOff
                        ? 'bg-destructive/10 border-destructive/30'
                        : 'bg-primary/10 border-primary/30'
                      : 'bg-muted/30 border-muted',
                    isThisWeek && 'ring-2 ring-primary ring-offset-1'
                  )}
                >
                  <div className="text-[10px] text-muted-foreground mb-1">
                    {format(parseISO(weekDate), 'MMM d')}
                  </div>
                  {entry ? (
                    <>
                      <div className={cn(
                        "text-sm font-bold flex items-center justify-center gap-0.5",
                        isOff ? "text-destructive" : "text-primary"
                      )}>
                        {entry.actual_value}
                        {isOff ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <TrendingUp className="h-3 w-3" />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
