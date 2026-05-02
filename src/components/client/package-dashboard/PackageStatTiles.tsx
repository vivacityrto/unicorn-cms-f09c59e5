import { Clock, Layers, ListTodo, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';
import { formatHours } from './formatters';

interface Props { dashboard: ClientPackageDashboardRow | null; }

function fmtRelative(iso: string | null): { label: string; tone: 'neutral' | 'amber' | 'red' } {
  if (!iso) return { label: 'No activity', tone: 'red' };
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { label: 'No activity', tone: 'red' };
  const days = Math.floor((Date.now() - then) / 86_400_000);
  let label: string;
  if (days <= 0) label = 'today';
  else if (days === 1) label = 'yesterday';
  else if (days < 30) label = `${days}d ago`;
  else label = `${days}d stale`;
  const tone = days >= 30 ? 'red' : days >= 14 ? 'amber' : 'neutral';
  return { label, tone };
}

const TONE_TEXT: Record<'neutral' | 'amber' | 'red', string> = {
  neutral: 'text-foreground',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

interface TileBar {
  pct: number;
  colorClass: string;
}

function Tile({
  label, value, sub, icon: Icon, tone = 'neutral', subTone = 'neutral', bar,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'amber' | 'red';
  subTone?: 'neutral' | 'amber' | 'red';
  bar?: TileBar | null;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={cn('text-xl font-bold tracking-tight tabular-nums', TONE_TEXT[tone])}>
        {value}
      </div>
      {bar && (
        <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full', bar.colorClass)}
            style={{ width: `${Math.min(100, Math.max(0, bar.pct * 100))}%` }}
          />
        </div>
      )}
      {sub && (
        <div className={cn('text-xs', TONE_TEXT[subTone])}>{sub}</div>
      )}
    </div>
  );
}

export function PackageStatTiles({ dashboard }: Props) {
  // Disabled / unknown state
  if (!dashboard) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(['Hours', 'Stages', 'Open tasks', 'Last activity'] as const).map((l) => (
          <div key={l} className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-bold text-muted-foreground">—</div>
          </div>
        ))}
      </div>
    );
  }

  // Hours
  const hoursPct = Number(dashboard.hours_pct_used) || 0;
  const hoursTone: 'neutral' | 'amber' | 'red' =
    hoursPct >= 0.95 ? 'red' : hoursPct >= 0.75 ? 'amber' : 'neutral';
  const hoursUsedNum = Number(dashboard.hours_used) || 0;
  const hoursTotalNum = Number(dashboard.hours_total) || 0;
  const hoursValue = formatHours(hoursUsedNum);
  const hoursSub = hoursTotalNum > 0
    ? `of ${formatHours(hoursTotalNum)} (${Math.round(hoursPct * 100)}%)`
    : 'no allowance set';
  const hoursBarColor =
    hoursPct >= 0.95 ? 'bg-red-500' : hoursPct >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
  const hoursBar: TileBar = {
    pct: hoursTotalNum > 0 ? Math.min(1, hoursPct) : 0,
    colorClass: hoursBarColor,
  };

  // Stages
  const stagesValue = `${dashboard.stages_complete} / ${dashboard.stages_total}`;
  const stagesSub = dashboard.stages_total > 0
    ? `of ${dashboard.stages_total} stages`
    : 'no stages';
  const stagesBar: TileBar = {
    pct: dashboard.stages_total > 0 ? dashboard.stages_complete / dashboard.stages_total : 0,
    colorClass: 'bg-emerald-500',
  };

  // Tasks
  const overdue = dashboard.overdue_tasks;
  const openValue = dashboard.open_tasks;

  // Activity
  const act = fmtRelative(dashboard.last_activity_at);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Tile label="Hours" value={hoursValue} sub={hoursSub} icon={Clock} tone={hoursTone} bar={hoursBar} />
      <Tile label="Stages" value={stagesValue} sub={stagesSub} icon={Layers} bar={stagesBar} />
      <Tile
        label="Open tasks"
        value={openValue}
        sub={overdue > 0 ? `${overdue} overdue` : 'none overdue'}
        icon={ListTodo}
        subTone={overdue > 0 ? 'red' : 'neutral'}
      />
      <Tile label="Last activity" value={act.label} icon={Activity} tone={act.tone} />
    </div>
  );
}
