import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertCircle, TrendingUp, TrendingDown, Plus, MoreVertical, Pencil, Archive, Trash2 } from 'lucide-react';
import { useEosScorecardEntries } from '@/hooks/useEosScorecardEntries';
import { useEosIssues } from '@/hooks/useEos';
import { useTenantUsers } from '@/hooks/useTenantUsers';
import type { EosScorecardMetric } from '@/types/eos';
import { format, startOfWeek, subWeeks } from 'date-fns';
import { DeleteConfirmDialog } from '@/components/audit/DeleteConfirmDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface ScorecardEntryGridProps {
  metric: EosScorecardMetric;
  onEdit?: (metric: EosScorecardMetric) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  isArchiving?: boolean;
  isDeleting?: boolean;
}

function isOffTrackByDirection(value: number, target: number, direction?: string): boolean {
  switch (direction) {
    case 'lower_is_better': return value > target;
    case 'equals_target': return value !== target;
    case 'higher_is_better':
    default: return value < target;
  }
}

function getStatusLabel(direction?: string): { onTrack: string; offTrack: string } {
  switch (direction) {
    case 'lower_is_better': return { onTrack: 'Below target', offTrack: 'Above target' };
    case 'equals_target': return { onTrack: 'On target', offTrack: 'Off target' };
    default: return { onTrack: 'On target', offTrack: 'Below target' };
  }
}

export function ScorecardEntryGrid({ metric, onEdit, onArchive, onDelete, isArchiving, isDeleting }: ScorecardEntryGridProps) {
  const { entries, createEntry } = useEosScorecardEntries(metric.id);
  const { createIssue } = useEosIssues();
  const { getUserName } = useTenantUsers();
  const [newValue, setNewValue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      description: `${metric.name} is off target of ${metric.target_value} ${metric.unit}`,
      status: 'Open',
      priority: 2 as any,
    });
  };

  const isOffTrack = (value: number) => {
    return metric.target_value ? isOffTrackByDirection(value, metric.target_value, metric.direction) : false;
  };

  const latestEntry = entries?.[0];
  const showOffTrackAlert = latestEntry && metric.target_value && isOffTrack(latestEntry.value);
  const statusLabels = getStatusLabel(metric.direction);

  // Determine latest status badge
  const getStatusBadge = () => {
    if (!latestEntry || !metric.target_value) {
      return <Badge variant="secondary" className="text-xs">No Data</Badge>;
    }
    if (isOffTrack(latestEntry.value)) {
      return <Badge variant="destructive" className="text-xs">Off Track</Badge>;
    }
    return <Badge className="bg-green-600 text-xs">On Track</Badge>;
  };

  return (
    <>
      <Card className={metric.is_archived ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{metric.name}</CardTitle>
                {getStatusBadge()}
              </div>
              {metric.description && (
                <p className="text-sm text-muted-foreground mt-1">{metric.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-sm flex-wrap">
                <Badge variant="outline">Target: {metric.target_value} {metric.unit}</Badge>
                <Badge variant="secondary">{metric.frequency}</Badge>
                {metric.category && metric.category !== 'general' && (
                  <Badge variant="outline" className="border-primary/30">{metric.category}</Badge>
                )}
                {metric.owner_id && (
                  <Badge variant="outline" className="border-accent-foreground/30">
                    {getUserName(metric.owner_id)}
                  </Badge>
                )}
                {metric.direction && metric.direction !== 'higher_is_better' && (
                  <Badge variant="outline" className="text-xs">
                    {metric.direction === 'lower_is_better' ? '↓ Lower is better' : '= Equals target'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit?.(metric)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Metric
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowArchiveConfirm(true)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive Metric
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Metric
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Entry Form */}
          {!metric.is_archived && (
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
          )}

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
                          ? 'bg-destructive/10 border-destructive/30'
                          : 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
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
                            <TrendingDown className="h-4 w-4 text-destructive" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-green-600" />
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
                    <span className="text-destructive font-medium">{statusLabels.offTrack}</span>
                  ) : (
                    <span className="text-green-600 font-medium">{statusLabels.onTrack}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive Metric"
        description={`Are you sure you want to archive "${metric.name}"? It will be hidden from the active scorecard but can be viewed later.`}
        onConfirm={() => {
          onArchive?.(metric.id);
          setShowArchiveConfirm(false);
        }}
        confirmText={isArchiving ? 'Archiving...' : 'Archive'}
        isLoading={isArchiving}
      />

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Metric"
        description="This will permanently delete this metric. Metrics with recorded entries cannot be deleted — use archive instead."
        itemName={metric.name}
        onConfirm={() => {
          onDelete?.(metric.id);
          setShowDeleteConfirm(false);
        }}
        isDeleting={isDeleting}
      />
    </>
  );
}
