import { cn } from '@/lib/utils';

type SegmentKey = 'complete' | 'inProgress' | 'blocked' | 'offTrack' | 'notStarted';

export type StatusCountsInput = Partial<Record<SegmentKey, number>>;

const SEGMENTS: ReadonlyArray<{ key: SegmentKey; label: string; bar: string; dot: string }> = [
  { key: 'complete', label: 'Complete', bar: 'bg-green-500', dot: 'bg-green-500' },
  { key: 'inProgress', label: 'In progress', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  { key: 'blocked', label: 'Blocked', bar: 'bg-violet-500', dot: 'bg-violet-500' },
  { key: 'offTrack', label: 'Off track', bar: 'bg-orange-500', dot: 'bg-orange-500' },
  { key: 'notStarted', label: 'Not started', bar: 'bg-transparent', dot: 'bg-muted-foreground/40' },
];

function describe(counts: StatusCountsInput) {
  return SEGMENTS.filter(s => (counts[s.key] ?? 0) > 0)
    .map(s => `${counts[s.key]} ${s.label.toLowerCase()}`)
    .join(', ');
}

/**
 * A stacked bar of milestones by status. The track is visible against both light
 * and dark cards, and the segments are green (complete), blue (in progress),
 * violet (blocked) and orange (off track); the remainder is not started.
 */
export function StatusBar({
  counts,
  total,
  label,
  size = 'md',
  className,
}: {
  counts: StatusCountsInput;
  total?: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sum = SEGMENTS.reduce((acc, s) => acc + (counts[s.key] ?? 0), 0);
  const denominator = total ?? sum;
  const description = describe(counts);
  return (
    <div
      role="img"
      aria-label={description ? `${label}: ${description}` : `${label}: nothing started`}
      className={cn(
        'flex w-full overflow-hidden rounded-full bg-muted-foreground/20',
        size === 'sm' && 'h-1.5',
        size === 'md' && 'h-2',
        size === 'lg' && 'h-3',
        className,
      )}
    >
      {denominator > 0 &&
        SEGMENTS.filter(s => s.key !== 'notStarted' && (counts[s.key] ?? 0) > 0).map(s => (
          <div
            key={s.key}
            className={cn('h-full min-w-[3px]', s.bar)}
            style={{ width: `${((counts[s.key] ?? 0) / denominator) * 100}%` }}
          />
        ))}
    </div>
  );
}

/** Colour key for a StatusBar, in words and counts as well as colour. */
export function StatusLegend({ counts, className }: { counts: StatusCountsInput; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {SEGMENTS.filter(s => s.key === 'complete' || s.key === 'notStarted' || (counts[s.key] ?? 0) > 0).map(s => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden />
          <span className="font-medium tabular-nums text-foreground">{counts[s.key] ?? 0}</span>
          {s.label}
        </li>
      ))}
    </ul>
  );
}
