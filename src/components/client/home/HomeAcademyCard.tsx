import { ArrowRight, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';
import { useTenantAcademyLearnerAnalytics } from '@/features/pdp/useTenantAcademyStaffStats';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyBars } from '../academy-analytics/WeeklyBars';
import { academySummary, finishedPercent, hoursOf } from '../academy-analytics/academyInsights';
import { Bar } from './Ring';

const SECTION = 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';

/** The compact Academy picture for Home: how many people are learning, how much is finished, and the last eight weeks. */
export function HomeAcademyView({ data }: { data: TenantAcademyLearnerAnalytics }) {
  const t = data.totals;
  const pct = finishedPercent(t.chosen, t.finished);
  const lines = academySummary(data);
  return (
    <section aria-label="Academy at a glance" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION}>Academy</h2>
        <Link to="/client/academy-activity" className="inline-flex items-center text-sm text-primary hover:underline">
          Full Academy activity <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0">
                <div className="text-xl font-bold leading-tight tabular-nums text-foreground">{t.active_30d} of {t.learners} learning</div>
                <div className="text-xs text-muted-foreground">active in the last 30 days</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-foreground">Courses finished</span>
                <span className="tabular-nums text-muted-foreground">{t.finished} of {t.chosen} chosen</span>
              </div>
              <Bar value={pct} tone={pct >= 100 ? 'good' : 'primary'} label={`${pct}% of chosen courses finished`} />
            </div>
            <p className="text-xs text-muted-foreground">{t.lessons_completed} lessons completed, about {hoursOf(t.minutes)} hours of learning.</p>
            {lines[1] && <p className="text-sm text-foreground">{lines[1]}</p>}
          </div>
          <WeeklyBars weeks={data.trend.slice(-8)} compact />
        </div>
      </div>
    </section>
  );
}

/**
 * Loads the Academy figures for this organisation. It shows nothing while loading, when the person is not allowed to
 * see them (the function refuses anyone but the organisation's main contacts and Vivacity staff), or when nobody has
 * chosen a course yet, so Home never carries an empty or broken card.
 */
export function HomeAcademyCard({ tenantId }: { tenantId: number | null }) {
  const { data, isLoading, error } = useTenantAcademyLearnerAnalytics(tenantId);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (error || !data || data.totals.chosen === 0) return null;
  return <HomeAcademyView data={data} />;
}
