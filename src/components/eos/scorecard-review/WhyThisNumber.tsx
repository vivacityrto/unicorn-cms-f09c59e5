import { useMemo } from 'react';
import { FileBarChart, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { breakdownKind, buildBreakdown } from '@/features/eos-scorecard/cstBreakdown';
import type { Measure } from '@/features/eos-scorecard/scorecardView';
import { useCstWeekRows } from '@/features/eos-scorecard/useMetricReport';
import { SplitBar } from './SplitBar';

interface WhyThisNumberProps {
  measure: Measure;
  weekKey: string;
  onOpenReport: () => void;
}

/**
 * A short, plain explanation under an automatic client measure: what the number is made of, what would move it,
 * and who to look at first. The full breakdown is one click away. Measures people type in have no explanation here.
 */
export function WhyThisNumber({ measure, weekKey, onOpenReport }: WhyThisNumberProps) {
  const kind = breakdownKind(measure.metric.metric_key);
  const { current, isLoading, error } = useCstWeekRows(weekKey, kind !== null);
  const breakdown = useMemo(() => (kind && current.length > 0 ? buildBreakdown(kind, current, { value: measure.value, target: measure.target }) : null), [kind, current, measure.value, measure.target]);

  if (!kind) return null;
  if (isLoading) return <div className="h-16 animate-pulse rounded-lg bg-muted/50" aria-busy="true" aria-label="Working out what is behind this number" />;
  if (error || !breakdown) return <p className="text-sm text-muted-foreground">The breakdown could not be loaded for this week.</p>;

  const first = breakdown.list.slice(0, 3);
  return (
    <section aria-label={`What is behind ${measure.name}`} className="space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="text-sm font-medium leading-snug">{breakdown.sentence}</p>
      <SplitBar split={breakdown.split} />
      {breakdown.lift && (
        <p className="flex items-start gap-1.5 text-sm font-semibold">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {breakdown.lift}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {first.length > 0 ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground" title={first.map((r) => r.name).join(', ')}>
            Start with: {first.map((r) => r.name).join(', ')}
          </p>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" variant="secondary" className="h-8 gap-1.5" onClick={onOpenReport}>
          <FileBarChart className="h-4 w-4" aria-hidden />
          Full report
        </Button>
      </div>
    </section>
  );
}
