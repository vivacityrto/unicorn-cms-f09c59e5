import { ArrowRight, Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { PackageStatusPill } from '../package-dashboard/PackageStatusPill';
import { Bar } from './Ring';
import { activePackages, hoursPercent, stagePercent, statusReason, type HomePackage } from './homeInsights';

const hoursTone = (p: number) => (p >= 95 ? 'bad' : p >= 75 ? 'warn' : 'primary');

function PackageCard({ p }: { p: HomePackage }) {
  const stages = stagePercent(p);
  const hours = hoursPercent(p);
  const reason = statusReason(p);
  const hoursLeft = Math.round(Math.max(0, p.hours_total - p.hours_used) * 10) / 10;
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <Briefcase className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">{p.package_name ?? 'Package'}</div>
            <div className="text-xs text-muted-foreground">
              {p.current_stage_shortname ? `Now in ${p.current_stage_shortname}` : 'Stage plan not set up yet'}
              {p.last_activity_at ? ` · last activity ${formatDistanceToNow(parseISO(p.last_activity_at), { addSuffix: true })}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PackageStatusPill status={p.status_pill} />
          <Link to="/client/packages" className="inline-flex items-center text-sm text-primary hover:underline">
            View <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {reason && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-foreground">{reason}. A quick check-in with your consultant will help.</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-foreground">Progress</span>
            <span className="tabular-nums text-muted-foreground">
              {p.stages_complete} of {p.stages_total} stages
            </span>
          </div>
          <Bar value={stages} label={`${stages}% of stages complete`} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-foreground">Hours</span>
            <span className="tabular-nums text-muted-foreground">{p.hours_total > 0 ? `${hoursLeft} h left of ${Math.round(p.hours_total * 10) / 10}` : 'No hours in this package'}</span>
          </div>
          <Bar value={hours} tone={hoursTone(hours)} ticks={[75, 95]} label={`${hours}% of hours used`} />
        </div>
      </div>

      {(p.open_tasks > 0 || p.overdue_tasks > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {p.open_tasks} open {p.open_tasks === 1 ? 'task' : 'tasks'}
          {p.overdue_tasks > 0 ? <span className="font-medium text-destructive"> · {p.overdue_tasks} overdue</span> : null}
        </p>
      )}
    </li>
  );
}

/** One card per active package, with progress and hours drawn as bars and a plain reason when it needs a nudge. */
export function HomePackageCards({ rows, isLoading }: { rows: readonly HomePackage[]; isLoading: boolean }) {
  const active = activePackages(rows);
  return (
    <section aria-label="Your packages" className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Your packages</h2>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted/50" aria-busy="true" />
      ) : active.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No active packages right now.</p>
      ) : (
        <ul className="space-y-3">
          {active.map((p) => (
            <PackageCard key={p.package_instance_id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
