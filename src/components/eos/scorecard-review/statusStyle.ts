import type { PlainStatus } from '@/features/eos-scorecard/scorecardView';

/** One place for the colours of the four statuses, so the page, the cards and the L10 deck always match. */
export const STATUS_STYLE: Record<PlainStatus, { pill: string; bar: string; edge: string }> = {
  on_track: {
    pill: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
    bar: 'bg-green-600',
    edge: 'border-l-green-600',
  },
  nearly: {
    pill: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    bar: 'bg-amber-500',
    edge: 'border-l-amber-500',
  },
  off_track: {
    pill: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
    bar: 'bg-red-600',
    edge: 'border-l-red-600',
  },
  waiting: {
    pill: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    edge: 'border-l-muted-foreground/40',
  },
};
