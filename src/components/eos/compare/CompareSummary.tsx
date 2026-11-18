import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rankSentence, streakSentence, type SeriesComparison } from '@/features/eos-scorecard/comparison';

const SHAPE = {
  improving: { text: 'Improving over time', Icon: TrendingUp, tone: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300' },
  slipping: { text: 'Slipping over time', Icon: TrendingDown, tone: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' },
  steady: { text: 'Steady', Icon: Minus, tone: 'bg-muted text-muted-foreground' },
} as const;

/** The overall shape, the streak and where the latest number ranks, in a sentence or two. */
export function CompareSummary({ comparison, noun = 'week', className }: { comparison: SeriesComparison; noun?: string; className?: string }) {
  const sentences = [rankSentence(comparison, noun), streakSentence(comparison, noun)].filter(Boolean);
  const shape = comparison.trend ? SHAPE[comparison.trend] : null;
  if (!shape && sentences.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {shape && (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', shape.tone)}>
          <shape.Icon className="h-3.5 w-3.5" aria-hidden />
          {shape.text}
        </span>
      )}
      {sentences.length > 0 && <p className="text-sm font-medium">{sentences.join(' ')}</p>}
    </div>
  );
}
