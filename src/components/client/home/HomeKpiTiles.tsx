import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { Ring } from './Ring';
import type { HomeTotals } from './homeInsights';

const hoursTone = (p: number) => (p >= 95 ? 'bad' : p >= 75 ? 'warn' : 'primary');

function Tile({ to, ring, title, value, note }: { to: string; ring: React.ReactNode; title: string; value: string; note: string }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {ring}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-xl font-bold leading-tight text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
    </Link>
  );
}

/** Four numbers a client can act on: hours left, stages done, tasks outstanding, and when the package ends. */
export function HomeKpiTiles({ totals }: { totals: HomeTotals }) {
  const hoursLeft = Math.round(totals.hoursRemaining * 10) / 10;
  const hoursLabel = `${totals.hoursPercent}% of hours used`;
  const stagesLabel = `${totals.stagesComplete} of ${totals.stagesTotal} stages complete`;
  return (
    <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        to="/client/packages"
        ring={<Ring value={totals.hoursPercent} tone={hoursTone(totals.hoursPercent)} label={hoursLabel}>{totals.hoursPercent}%</Ring>}
        title="Hours left"
        value={totals.hoursTotal > 0 ? `${hoursLeft} h` : 'No hours'}
        note={totals.hoursTotal > 0 ? `${hoursLabel} of ${Math.round(totals.hoursTotal * 10) / 10}` : 'No consulting hours in your package'}
      />
      <Tile
        to="/client/packages"
        ring={<Ring value={totals.stagesPercent} label={stagesLabel}>{totals.stagesPercent}%</Ring>}
        title="Progress"
        value={totals.stagesTotal > 0 ? `${totals.stagesComplete} / ${totals.stagesTotal}` : 'Not set up'}
        note={totals.stagesTotal > 0 ? 'stages complete' : 'Stages will appear once planned'}
      />
      <Tile
        to="/client/tasks"
        ring={
          <Ring value={totals.openTasks > 0 ? Math.round((1 - totals.overdueTasks / totals.openTasks) * 100) : 100} tone={totals.overdueTasks > 0 ? 'bad' : 'good'} label={`${totals.openTasks} open tasks, ${totals.overdueTasks} overdue`}>
            {totals.openTasks}
          </Ring>
        }
        title="Open tasks"
        value={totals.overdueTasks > 0 ? `${totals.overdueTasks} overdue` : 'None overdue'}
        note={`${totals.openTasks} open in total`}
      />
      <Tile
        to="/client/packages"
        ring={
          <Ring value={100} tone="primary" label="Package end date">
            <span className="text-[10px] leading-none">{totals.nextEnd ? format(parseISO(totals.nextEnd), 'MMM') : '–'}</span>
          </Ring>
        }
        title="Next renewal"
        value={totals.nextEnd ? format(parseISO(totals.nextEnd), 'd MMM yyyy') : 'No end date'}
        note="when your package period ends"
      />
    </section>
  );
}
