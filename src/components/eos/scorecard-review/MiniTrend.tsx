import { changeText, type Measure } from '@/features/eos-scorecard/scorecardView';

type TrendMeasure = Pick<Measure, 'history' | 'target' | 'unit'>;

const W = 160;
const H = 44;

/**
 * The recent weeks as small bars, with the aim as a dashed line, and one sentence on the latest change.
 * Gaps are left empty on purpose: a missing week should look missing.
 */
export function MiniTrend({ measure, className }: { measure: TrendMeasure; className?: string }) {
  const weeks = measure.history;
  const numbers = weeks.filter((v): v is number => v !== null);
  if (numbers.length === 0) return <p className={className ?? 'text-xs text-muted-foreground'}>No history yet.</p>;

  const max = Math.max(...numbers, measure.target) * 1.1 || 1;
  const y = (v: number) => H - 3 - (Math.max(v, 0) / max) * (H - 8);
  const barWidth = W / weeks.length;
  const change = changeText(measure);

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Last ${weeks.length} weeks`} className="block h-11 w-full">
        {weeks.map((v, i) =>
          v === null ? null : (
            <rect
              key={i}
              x={i * barWidth + 3}
              y={y(v)}
              width={barWidth - 6}
              height={Math.max(H - 3 - y(v), 1.5)}
              rx={2}
              className={i === weeks.length - 1 ? 'fill-primary' : 'fill-muted-foreground/30'}
            />
          ),
        )}
        <line x1={0} x2={W} y1={y(measure.target)} y2={y(measure.target)} className="stroke-foreground" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="text-xs text-muted-foreground">
        Last {weeks.length} weeks, dashed line is the aim{change ? ` · ${change}` : ''}
      </p>
    </div>
  );
}
