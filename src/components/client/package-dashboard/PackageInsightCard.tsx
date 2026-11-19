import { CalendarClock, Gauge, Info } from 'lucide-react';
import { statusReason } from '../home/homeInsights';
import { STATUS_MEANING, type HoursForecast } from './packageInsights';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';
import { cn } from '@/lib/utils';

const tone: Record<HoursForecast['verdict'], string> = {
  no_hours: 'text-muted-foreground',
  used_up: 'text-destructive',
  no_recent_work: 'text-muted-foreground',
  early: 'text-amber-700 dark:text-amber-300',
  on_pace: 'text-emerald-700 dark:text-emerald-300',
  spare: 'text-primary',
};

/**
 * Says in plain words how this package is tracking: what its status means, why it has that status,
 * and where its hours are heading. Everything is worked out from numbers already on the page.
 */
export function PackageInsightCard({ dashboard, forecast }: { dashboard: ClientPackageDashboardRow; forecast: HoursForecast }) {
  const reason = statusReason(dashboard);
  const meaning = STATUS_MEANING[dashboard.status_pill];
  const showForecast = forecast.verdict !== 'no_hours';
  if (!reason && !showForecast && !meaning) return null;

  return (
    <section aria-label="How this package is tracking" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How this package is tracking</h4>
      <ul className="mt-2 space-y-2 text-sm text-foreground">
        {meaning && (
          <li className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium">{dashboard.status_pill === 'on_track' ? 'On track' : dashboard.status_pill === 'drifting' ? 'Drifting' : dashboard.status_pill === 'stuck' ? 'Stuck' : dashboard.status_pill === 'on_hold' ? 'On hold' : 'Complete'}:</span> {meaning}
              {reason ? <span className="text-muted-foreground"> Right now: {reason.toLowerCase()}.</span> : null}
            </span>
          </li>
        )}
        {showForecast && (
          <li className="flex gap-2">
            <Gauge className={cn('mt-0.5 h-4 w-4 shrink-0', tone[forecast.verdict])} aria-hidden />
            <span>{forecast.sentence}</span>
          </li>
        )}
        {dashboard.end_date && (
          <li className="flex gap-2 text-muted-foreground">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>This is a projection from recent work, not a promise. Your consultant can adjust the plan with you.</span>
          </li>
        )}
      </ul>
    </section>
  );
}
