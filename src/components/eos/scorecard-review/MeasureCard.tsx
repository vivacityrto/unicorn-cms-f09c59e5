import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatValue, gapText, type Measure } from '@/features/eos-scorecard/scorecardView';
import { AimBar } from './AimBar';
import { MiniTrend } from './MiniTrend';
import { StatusPill } from './StatusPill';
import { STATUS_STYLE } from './statusStyle';

interface MeasureCardProps {
  measure: Measure;
  areaName: string;
  ownerName: string | null;
  /** A link or button for the card's footer, e.g. "See which clients". */
  action?: ReactNode;
}

/** One measure that needs a look: the number, how far from the aim, the bar, the recent weeks, and who owns it. */
export function MeasureCard({ measure, areaName, ownerName, action }: MeasureCardProps) {
  return (
    <article className={cn('flex min-w-0 flex-col gap-2 rounded-xl border border-l-[5px] bg-card p-4', STATUS_STYLE[measure.status].edge)} aria-label={measure.name}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{areaName}</span>
        <StatusPill status={measure.status} />
      </div>
      <h3 className="text-lg font-bold leading-snug">{measure.name}</h3>
      <p className="text-4xl font-bold leading-none tabular-nums">{formatValue(measure.unit, measure.value)}</p>
      <p className="text-sm font-semibold">{gapText(measure)}</p>
      <AimBar measure={measure} />
      <MiniTrend measure={measure} />
      {measure.description && <p className="text-sm text-muted-foreground">{measure.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-muted-foreground">
        <span>Owner: {ownerName ?? 'Nobody yet'}</span>
        {action}
      </div>
    </article>
  );
}
