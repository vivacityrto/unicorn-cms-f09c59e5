import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Split } from '@/features/eos-scorecard/cstBreakdown';

const TONE = {
  good: { bar: 'bg-green-600', text: 'text-green-700 dark:text-green-400', mark: Check },
  bad: { bar: 'bg-red-600', text: 'text-red-700 dark:text-red-400', mark: X },
} as const;

/** Two parts of a whole as one bar, with each part named and counted underneath, so colour is never the only signal. */
export function SplitBar({ split, className, compact = false }: { split: readonly Split[]; className?: string; compact?: boolean }) {
  const total = split.reduce((sum, part) => sum + part.count, 0);
  if (split.length === 0 || total === 0) return null;
  const summary = split.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(', ');
  return (
    <div className={className}>
      <div role="img" aria-label={summary} className={cn('flex overflow-hidden rounded-full bg-muted', compact ? 'h-2' : 'h-3')}>
        {split.map((part) => (
          <div key={part.label} className={cn('h-full', TONE[part.tone].bar)} style={{ width: `${(part.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className={cn('flex flex-wrap gap-y-0', compact ? 'mt-1 gap-x-3 text-xs' : 'mt-1.5 gap-x-4 text-sm')}>
        {split.map((part) => {
          const Mark = TONE[part.tone].mark;
          return (
            <li key={part.label} className={cn('flex items-center gap-1 font-medium', TONE[part.tone].text)}>
              <Mark className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{part.count}</span> {part.label.toLowerCase()}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
