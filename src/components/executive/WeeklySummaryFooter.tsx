/**
 * WeeklySummaryFooter – Unicorn 2.0
 *
 * One-line factual summary at the bottom of the Executive Dashboard.
 * "This week: X improved, Y worsened, Z stalled, C critical risks created."
 */

import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface WeeklySummaryFooterProps {
  data: ExecutiveHealthRow[];
}

export function WeeklySummaryFooter({ data }: WeeklySummaryFooterProps) {
  if (data.length === 0) return null;

  const improved = data.filter(r => r.delta_overall_score_7d > 0).length;
  const worsened = data.filter(r => r.delta_overall_score_7d < 0).length;
  const stalled = data.filter(r => r.days_stale > 14).length;
  const criticalCreated = data.filter(r => r.has_active_critical).length;

  return (
    <div className="px-4 py-2 text-center">
      <p className="text-xs text-muted-foreground">
        This week: <span className="font-medium text-foreground">{improved}</span> improved,{' '}
        <span className="font-medium text-foreground">{worsened}</span> worsened,{' '}
        <span className="font-medium text-foreground">{stalled}</span> stalled,{' '}
        <span className="font-medium text-foreground">{criticalCreated}</span> critical risks active.
      </p>
    </div>
  );
}
