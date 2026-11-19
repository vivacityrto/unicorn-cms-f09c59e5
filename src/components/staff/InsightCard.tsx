import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** One short line under the label, such as "Oldest waiting 3 days". */
  hint?: string;
  /** Marks the card whose filter is on. Leave undefined for a card that opens something instead of filtering. */
  active?: boolean;
  /** Draws attention (for example when something has waited a long time). */
  alert?: boolean;
  onClick: () => void;
}

/** A compact, clickable summary: the number, what it is, and one line of context. Sits in a row of three or four. */
export function InsightCard({ icon: Icon, label, value, hint, active, alert, onClick }: InsightCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        'group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'border-primary bg-primary/5 ring-1 ring-primary/40',
      )}
    >
      <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', alert ? 'bg-[#ED1878]/15 text-[#ED1878]' : 'bg-primary/10 text-primary')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-bold leading-none tabular-nums text-foreground">{value}</span>
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
        </span>
        {hint && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
