import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate, relativeDays } from '@/utils/rockPanelFormat';
import {
  timelineModel,
  type MilestoneMetrics,
  type PanelMilestone,
} from '@/utils/rockPanelMetrics';
import type { RockDeliveryShare, RockDeliverySummary } from '@/utils/milestoneDelivery';
import { QuarterTimeline } from '@/components/eos/rocks/detail/QuarterTimeline';
import { StatusBar, StatusLegend, type StatusCountsInput } from '@/components/eos/rocks/detail/StatusBar';

interface UserInfo {
  name: string;
  initials: string;
}

type Tone = 'good' | 'bad' | 'warn';

const TONE: Record<Tone, string> = {
  good: 'text-green-700 dark:text-green-300',
  bad: 'text-destructive',
  warn: 'text-amber-700 dark:text-amber-300',
};

function Tile({
  label,
  value,
  of,
  sub,
  tone,
  subTone,
  children,
}: {
  label: string;
  value?: ReactNode;
  of?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  subTone?: Tone;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {value !== undefined && (
        <p className={cn('mt-1 text-2xl font-semibold leading-none tabular-nums', tone && TONE[tone])}>
          {value}
          {of !== undefined && <span className="text-base font-normal text-muted-foreground"> / {of}</span>}
        </p>
      )}
      {sub && <p className={cn('mt-1.5 text-xs', subTone ? cn('font-medium', TONE[subTone]) : 'text-muted-foreground')}>{sub}</p>}
      {children}
    </div>
  );
}

function AttentionLines({ lines }: { lines: Array<{ n: number; text: string; tone: Tone }> }) {
  const shown = lines.filter(l => l.n > 0);
  if (shown.length === 0) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Nothing flagged
      </p>
    );
  }
  return (
    <ul className="mt-1.5 space-y-1">
      {shown.map(line => (
        <li key={line.text} className="flex items-baseline gap-2 text-xs">
          <span className={cn('text-lg font-semibold leading-none tabular-nums', TONE[line.tone])}>{line.n}</span>
          <span className="text-muted-foreground">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ownerInitials(name: string) {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function DeliveryByOwner({
  shares,
  getUserInfo,
}: {
  shares: RockDeliveryShare[];
  getUserInfo?: (userId: string) => UserInfo | null;
}) {
  if (shares.length === 0) return null;
  return (
    <section aria-labelledby="delivery-by-owner" className="space-y-2">
      <h4 id="delivery-by-owner" className="text-sm font-semibold">Delivery by owner</h4>
      <ul className="divide-y rounded-lg border bg-card">
        {shares.map(share => {
          const owner = share.ownerId && getUserInfo ? getUserInfo(share.ownerId) : null;
          const name = owner?.name ?? 'Owner not shown';
          return (
            <li key={share.rockId} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,14rem)_auto]">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">{ownerInitials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground" title={share.rockTitle}>{share.rockTitle}</p>
              </div>
              <StatusBar
                className="col-span-2 sm:col-span-1"
                label={`${name}: delivery`}
                total={share.total}
                counts={{ complete: share.complete, inProgress: share.inProgress, blocked: share.blocked, offTrack: share.offTrack }}
              />
              <p className="col-span-2 justify-self-end text-xs tabular-nums sm:col-span-1">
                <span className="text-sm font-semibold">{share.complete}</span>
                <span className="text-muted-foreground"> of {share.total}</span>
                {share.blocked > 0 && <span className="ml-2 font-medium text-destructive">{share.blocked} blocked</span>}
                {share.overdue > 0 && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">{share.overdue} overdue</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface MilestoneHeroProps {
  isCompany: boolean;
  quarter: { year: number; quarter: number };
  todayIso: string;
  milestones: PanelMilestone[];
  metrics: MilestoneMetrics;
  delivery?: { summary: RockDeliverySummary; shares: RockDeliveryShare[] } | null;
  /** A Company Rock's links are still loading: hold the delivery tiles' place instead of flashing the generic ones. */
  deliveryPending?: boolean;
  getUserInfo?: (userId: string) => UserInfo | null;
}

/** The headline of the panel: how far the milestones have got, what needs attention, and when things fall due. */
export function MilestoneHero({ isCompany, quarter, todayIso, milestones, metrics, delivery, deliveryPending, getUserInfo }: MilestoneHeroProps) {
  if (metrics.total === 0) return null;
  const shares = delivery?.shares ?? [];
  const useDelivery = isCompany && !!delivery && delivery.summary.contributors > 0;

  const barCounts: StatusCountsInput = useDelivery
    ? shares.reduce<Required<StatusCountsInput>>(
        (acc, s) => ({
          complete: acc.complete + s.complete,
          inProgress: acc.inProgress + s.inProgress,
          blocked: acc.blocked + s.blocked,
          offTrack: acc.offTrack + s.offTrack,
          notStarted: acc.notStarted + (s.total - s.complete - s.inProgress - s.blocked - s.offTrack),
        }),
        { complete: 0, inProgress: 0, blocked: 0, offTrack: 0, notStarted: 0 },
      )
    : { complete: metrics.complete, inProgress: metrics.inProgress, blocked: metrics.blocked, offTrack: metrics.offTrack, notStarted: metrics.notStarted };
  const barTotal = useDelivery ? delivery!.summary.contributors : metrics.active;
  const barLabel = useDelivery ? 'Delivery by the linked Individual milestones' : 'Milestones by status';

  const timeline = timelineModel(milestones, quarter, todayIso);
  const next = metrics.nextDue;
  const timelineSummary = `Due dates across the quarter: ${timeline.points.length} milestones placed${
    next ? `, next due ${next.ref} on ${formatDate(next.dueDate, 'd MMM')}` : ''
  }.`;

  const sum = (pick: (s: RockDeliveryShare) => number) => shares.reduce((acc, s) => acc + pick(s), 0);

  return (
    <div className="space-y-4" data-testid="milestone-hero">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isCompany && deliveryPending ? (
          [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[106px] w-full rounded-lg" />)
        ) : isCompany && delivery ? (
          <>
            <Tile label="Signed off" value={metrics.complete} of={metrics.active} sub={metrics.percentComplete === null ? 'Nothing active' : `${metrics.percentComplete}% of milestones`} />
            <Tile
              label="Delivered"
              value={delivery.summary.contributorsComplete}
              of={delivery.summary.contributors}
              sub={delivery.summary.percent === null ? 'No Individual milestones linked' : `${delivery.summary.percent}% of linked milestones`}
            />
            <Tile
              label="Being delivered"
              value={delivery.summary.covered}
              of={delivery.summary.milestones}
              subTone={delivery.summary.uncovered > 0 ? 'warn' : undefined}
              sub={delivery.summary.uncovered > 0 ? `${delivery.summary.uncovered} with nothing delivering` : 'Every milestone has work behind it'}
            />
            <Tile label="Needs attention">
              <AttentionLines
                lines={[
                  { n: sum(s => s.blocked), text: 'blocked deliverables', tone: 'bad' },
                  { n: sum(s => s.overdue), text: 'overdue deliverables', tone: 'warn' },
                  { n: metrics.overdue, text: 'past their due date', tone: 'warn' },
                  { n: delivery.summary.uncovered, text: 'with nothing delivering', tone: 'warn' },
                  { n: delivery.summary.readyForReview, text: 'ready for sign-off', tone: 'good' },
                ]}
              />
            </Tile>
          </>
        ) : (
          <>
            <Tile label="Done" value={metrics.complete} of={metrics.active} sub={metrics.percentComplete === null ? 'Nothing active' : `${metrics.percentComplete}% complete`} />
            <Tile label="In progress" value={metrics.inProgress} sub={`${metrics.notStarted} not started`} />
            <Tile label="Needs attention">
              <AttentionLines
                lines={[
                  { n: metrics.blocked, text: 'blocked', tone: 'bad' },
                  { n: metrics.offTrack, text: 'off track', tone: 'bad' },
                  { n: metrics.overdue, text: 'overdue', tone: 'warn' },
                  { n: metrics.tasks.blocked, text: 'blocked tasks', tone: 'bad' },
                ]}
              />
            </Tile>
            <Tile
              label="Next due"
              value={next ? formatDate(next.dueDate, 'd MMM') : '—'}
              tone={next && next.days < 0 ? 'bad' : undefined}
              sub={next ? `${next.ref} · ${relativeDays(next.days)}` : 'No open due dates'}
            />
          </>
        )}
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 className="text-sm font-semibold">{barLabel}</h4>
          <p className="text-xs text-muted-foreground tabular-nums">
            {useDelivery
              ? `${barCounts.complete} of ${barTotal} delivered`
              : `${metrics.complete} of ${metrics.active} complete${metrics.deferred > 0 ? ` · ${metrics.deferred} deferred` : ''}`}
          </p>
        </div>
        <StatusBar size="lg" label={barLabel} counts={barCounts} total={barTotal} />
        <StatusLegend counts={barCounts} />
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 className="text-sm font-semibold">Due dates this quarter</h4>
          <p className="text-xs text-muted-foreground">
            {next ? (
              <>
                Next: <span className="font-medium text-foreground">{next.ref}</span> · {formatDate(next.dueDate, 'd MMM')} ·{' '}
                <span className={cn(next.days < 0 && 'font-medium text-destructive')}>{relativeDays(next.days)}</span>
              </>
            ) : (
              'No open due dates'
            )}
          </p>
        </div>
        <QuarterTimeline model={timeline} summary={timelineSummary} />
      </div>

      {isCompany && <DeliveryByOwner shares={shares} getUserInfo={getUserInfo} />}
    </div>
  );
}
