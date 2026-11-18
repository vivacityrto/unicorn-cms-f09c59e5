import { cn } from '@/lib/utils';
import { STATUS_LABEL, STATUS_MARK, type PlainStatus } from '@/features/eos-scorecard/scorecardView';
import { STATUS_STYLE } from './statusStyle';

/** The status in words, with a symbol, so it never depends on colour alone. */
export function StatusPill({ status, className }: { status: PlainStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold', STATUS_STYLE[status].pill, className)}>
      <span aria-hidden="true">{STATUS_MARK[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
