import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { TrendSparkline } from './TrendSparkline';
import { calculateStatus } from '@/types/scorecard';
import type { ScorecardMetric, MetricStatus } from '@/types/scorecard';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DeleteConfirmDialog } from '@/components/audit/DeleteConfirmDialog';
import { useTenantUsers } from '@/hooks/useTenantUsers';

interface MetricRowProps {
  metric: ScorecardMetric;
  onEdit: (m: ScorecardMetric) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRecord: (metric: ScorecardMetric, value: number, notes?: string, weekEnding?: string) => void;
  onViewHistory: (m: ScorecardMetric) => void;
  isArchiving?: boolean;
  isDeleting?: boolean;
}

export function MetricRow({
  metric,
  onEdit,
  onArchive,
  onDelete,
  onRecord,
  onViewHistory,
  isArchiving,
  isDeleting,
}: MetricRowProps) {
  const { getUserName } = useTenantUsers();
  const [showEntry, setShowEntry] = useState(false);
  const [entryValue, setEntryValue] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const hasThisWeekEntry = metric.recentEntries?.some((e) => e.week_ending === thisWeek);

  const trendStatuses: (MetricStatus | null)[] = (metric.recentEntries || [])
    .slice()
    .reverse()
    .map((e) => {
      const val = e.actual_value ?? e.value;
      if (val == null) return null;
      return calculateStatus(val as number, metric.target_value, metric.direction);
    });

  const handleRecord = () => {
    const v = parseFloat(entryValue);
    if (isNaN(v)) return;
    onRecord(metric, v, entryNotes || undefined, thisWeek);
    setEntryValue('');
    setEntryNotes('');
    setShowEntry(false);
  };

  const latestValue = metric.latestEntry
    ? (metric.latestEntry.actual_value ?? metric.latestEntry.value)
    : null;

  const ownerName = metric.owner_id ? getUserName(metric.owner_id) : null;

  return (
    <>
      <div className={cn('grid items-center gap-2 py-2.5 px-3 rounded-md hover:bg-muted/30 transition-colors group', 'grid-cols-[minmax(180px,2fr)_100px_90px_80px_80px_100px_120px_70px_44px]')}>
        {/* Metric name */}
        <div className="min-w-0">
          <button
            onClick={() => onViewHistory(metric)}
            className="text-sm font-medium hover:text-primary text-left truncate block w-full"
            title={metric.name}
          >
            {metric.name}
          </button>
          {metric.description && (
            <p className="text-xs text-muted-foreground truncate">{metric.description}</p>
          )}
        </div>

        {/* Owner */}
        <div className="text-xs text-muted-foreground truncate">
          {ownerName || <span className="italic opacity-60">Unassigned</span>}
        </div>

        {/* Category */}
        <div>
          <Badge variant="outline" className="text-xs px-1.5 py-0.5 truncate max-w-full">
            {metric.category}
          </Badge>
        </div>

        {/* Target */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {metric.target_value} {metric.unit}
        </div>

        {/* Latest */}
        <div className="text-sm font-semibold whitespace-nowrap">
          {latestValue != null ? (
            <span>{latestValue} <span className="text-xs font-normal text-muted-foreground">{metric.unit}</span></span>
          ) : (
            <span className="text-muted-foreground text-xs italic">—</span>
          )}
        </div>

        {/* Status */}
        <div>
          <StatusBadge status={metric.latestStatus || 'no_data'} size="sm" />
        </div>

        {/* Trend */}
        <TrendSparkline statuses={trendStatuses} compact />

        {/* Source */}
        <div>
          <Badge
            variant="secondary"
            className={cn('text-[10px] px-1.5 py-0', metric.metric_source === 'automatic' && 'bg-primary/10 text-primary')}
          >
            {metric.metric_source === 'automatic' ? 'Auto' : metric.metric_source === 'hybrid' ? 'Hybrid' : 'Manual'}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 justify-end">
          {metric.metric_source !== 'automatic' && !metric.is_archived && !hasThisWeekEntry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowEntry((v) => !v)}
              title="Record this week's result"
            >
              {showEntry ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
          {metric.metric_source === 'automatic' && (
            <RefreshCw className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(metric)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewHistory(metric)}>
                <Clock className="h-3.5 w-3.5 mr-2" /> View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowArchiveConfirm(true)}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Inline entry form */}
      {showEntry && !hasThisWeekEntry && (
        <div className="mx-3 mb-2 flex gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20 animate-fade-in">
          <div className="text-xs text-muted-foreground self-center whitespace-nowrap">
            Week of {format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')} · Target: {metric.target_value} {metric.unit}
          </div>
          <Input
            type="number"
            placeholder="Actual value"
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value)}
            className="w-28 h-8 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleRecord()}
            autoFocus
          />
          <Textarea
            placeholder="Notes (optional)"
            value={entryNotes}
            onChange={(e) => setEntryNotes(e.target.value)}
            className="flex-1 h-8 min-h-0 text-sm resize-none"
            rows={1}
          />
          <Button onClick={handleRecord} disabled={!entryValue.trim()} size="sm" className="h-8">
            Save
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowEntry(false)}>
            Cancel
          </Button>
        </div>
      )}

      {hasThisWeekEntry && showEntry && (
        <div className="mx-3 mb-2 p-2 bg-green-500/5 rounded text-xs text-green-700 dark:text-green-400">
          ✓ Result already recorded for this week
        </div>
      )}

      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive Metric"
        description={`Archive "${metric.name}"? It will be hidden from the active scorecard but history is preserved.`}
        onConfirm={() => { onArchive(metric.id); setShowArchiveConfirm(false); }}
        confirmText={isArchiving ? 'Archiving...' : 'Archive'}
        isLoading={isArchiving}
      />

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Metric"
        description="Metrics with recorded entries cannot be deleted — archive instead. This action is permanent."
        itemName={metric.name}
        onConfirm={() => { onDelete(metric.id); setShowDeleteConfirm(false); }}
        isDeleting={isDeleting}
      />
    </>
  );
}
