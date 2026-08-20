import { cn } from '@/lib/utils';

interface PackageUsageBarProps {
  usedMinutes: number;
  includedMinutes: number;
  carriedInMinutes?: number;
  isOverBudget?: boolean;
  isNearLimit?: boolean;
  className?: string;
}

/**
 * Segmented package-usage bar: the base allowance (this period's own
 * included minutes) and any carried-over minutes are shown as two distinct
 * background segments, with a used-amount overlay drawn on top spanning
 * both. Lets a glance answer "how much of what I'm using is eating into
 * carry-over vs. this period's own allowance" - carried_in_minutes is
 * already available per-period (package_renewal_periods.carried_in_minutes)
 * but was previously only shown as "(+X.Xh carried over)" text, folded into
 * a single-colour bar total.
 *
 * Falls back to a plain single-segment bar when there's no carry-in, so the
 * common (never-renewed-yet, or forfeited) case looks unchanged.
 */
export function PackageUsageBar({ usedMinutes, includedMinutes, carriedInMinutes = 0, isOverBudget = false, isNearLimit = false, className }: PackageUsageBarProps) {
  const total = includedMinutes;
  const carriedPct = total > 0 ? Math.min((carriedInMinutes / total) * 100, 100) : 0;
  const basePct = total > 0 ? Math.max(100 - carriedPct, 0) : 0;
  const usedPct = total > 0 ? Math.min((usedMinutes / total) * 100, 100) : 0;

  return (
    <div className={cn('relative h-1.5 w-full rounded-full overflow-hidden bg-muted', className)}>
      {carriedInMinutes > 0 && (
        <div className="absolute inset-y-0 left-0 flex w-full">
          <div style={{ width: `${carriedPct}%` }} className="h-full bg-muted-foreground/25" />
          <div style={{ width: `${basePct}%` }} className="h-full bg-muted" />
        </div>
      )}
      <div
        style={{ width: `${usedPct}%` }}
        className={cn('absolute inset-y-0 left-0 h-full transition-all', isOverBudget ? 'bg-destructive' : isNearLimit ? 'bg-yellow-500' : 'bg-primary')}
      />
    </div>
  );
}
