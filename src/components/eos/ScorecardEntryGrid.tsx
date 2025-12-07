import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { useEosScorecardEntries } from '@/hooks/useEosScorecardEntries';
import { useEosIssues } from '@/hooks/useEos';
import type { EosScorecardMetric } from '@/types/eos';
import { format, startOfWeek, subWeeks } from 'date-fns';

interface ScorecardEntryGridProps {
  metric: EosScorecardMetric;
}

export function ScorecardEntryGrid({ metric }: ScorecardEntryGridProps) {
  const { entries, createEntry } = useEosScorecardEntries(metric.id);
  const { createIssue } = useEosIssues();
  const [newValue, setNewValue] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Generate last 13 weeks
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const weekDate = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
    return format(weekDate, 'yyyy-MM-dd');
  }).reverse();

  const getEntryForWeek = (weekDate: string) => {
    return entries?.find(e => e.week_ending === weekDate);
  };

  const handleAddEntry = async () => {
    if (!newValue.trim()) return;
    
    const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    await createEntry.mutateAsync({
      metric_id: metric.id,
      week_ending: thisWeek,
      value: parseFloat(newValue),
      notes: newNotes || undefined,
    });
    
    setNewValue('');
    setNewNotes('');
  };

  const handleAddToIssues = async () => {
    await createIssue.mutateAsync({
      title: `Off-track metric: ${metric.name}`,
      description: `${metric.name} is below target of ${metric.target_value} ${metric.unit}`,
      status: 'Open',
      priority: 2 as any,
    });
  };

  const isOffTrack = (value: number) => {
    return metric.target_value ? value < metric.target_value : false;
  };

  const latestEntry = entries?.[0];
  const showOffTrackAlert = latestEntry && metric.target_value && isOffTrack(latestEntry.value);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{metric.name}</CardTitle>
            {metric.description && (
              <p className="text-sm text-muted-foreground mt-1">{metric.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-sm">
              <Badge variant="outline">Target: {metric.target_value} {metric.unit}</Badge>
              <Badge variant="secondary">{metric.frequency}</Badge>
            </div>
          </div>
          {showOffTrackAlert && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAddToIssues}
              className="gap-2"
            >
              <AlertCircle className="h-4 w-4" />
              Add to Issues
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Entry Form */}
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
            disabled={!newValue.trim() || createEntry.isPending}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Record
          </Button>
        </div>

        {/* 13-Period Grid */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {weeks.map((weekDate) => {
              const entry = getEntryForWeek(weekDate);
              const isOff = entry && metric.target_value ? isOffTrack(entry.value) : false;
              
              return (
                <div
                  key={weekDate}
                  className={`flex-1 min-w-[80px] p-3 rounded border text-center ${
                    entry
                      ? isOff
                        ? 'bg-red-50 border-red-200'
                        : 'bg-green-50 border-green-200'
                      : 'bg-muted/30 border-muted'
                  }`}
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {format(new Date(weekDate), 'MMM d')}
                  </div>
                  {entry ? (
                    <>
                      <div className="text-lg font-bold flex items-center justify-center gap-1">
                        {entry.value}
                        {isOff ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      {entry.notes && (
                        <div className="text-xs text-muted-foreground truncate mt-1" title={entry.notes}>
                          {entry.notes}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">No data</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trend Summary */}
        {entries && entries.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
            <span>
              Latest: <span className="font-semibold">{latestEntry?.value} {metric.unit}</span>
            </span>
            {metric.target_value && (
              <span>
                {latestEntry && isOffTrack(latestEntry.value) ? (
                  <span className="text-red-600 font-medium">Below target</span>
                ) : (
                  <span className="text-green-600 font-medium">On target</span>
                )}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
