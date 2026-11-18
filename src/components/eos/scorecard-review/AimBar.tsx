import { cn } from '@/lib/utils';
import { aimText, formatValue, type Measure } from '@/features/eos-scorecard/scorecardView';
import { STATUS_STYLE } from './statusStyle';

type BarMeasure = Pick<Measure, 'value' | 'target' | 'unit' | 'direction' | 'status'>;

/**
 * The one picture of "where are we against the aim": a bar for the number, with the aim marked on it.
 * The same bar is used for every measure, so people learn to read it once.
 */
export function AimBar({ measure, showCaption = true, className }: { measure: BarMeasure; showCaption?: boolean; className?: string }) {
  const { value, target, status } = measure;
  const max = Math.max(target * 1.6, (value ?? 0) * 1.12, 1);
  const fill = value === null ? 0 : Math.min(100, (Math.max(value, 0) / max) * 100);
  const aim = Math.min(100, (target / max) * 100);
  const label = value === null ? `No number yet. Aim ${aimText(measure)}.` : `${formatValue(measure.unit, value)}. Aim ${aimText(measure)}.`;
  return (
    <div className={className}>
      <div role="img" aria-label={label} className="relative my-1.5 h-3 rounded-full bg-muted">
        <div className={cn('absolute inset-y-0 left-0 rounded-full', STATUS_STYLE[status].bar)} style={{ width: `${fill}%` }} />
        <div className="absolute -inset-y-1 w-[3px] rounded-sm bg-foreground" style={{ left: `calc(${aim}% - 1px)` }} aria-hidden="true" />
      </div>
      {showCaption && <p className="text-xs text-muted-foreground">Aim: {aimText(measure)}</p>}
    </div>
  );
}
