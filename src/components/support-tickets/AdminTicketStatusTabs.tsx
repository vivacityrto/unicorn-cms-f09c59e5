import { cn } from '@/lib/utils';

export type StatusTab = 'all' | 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed' | 'declined';

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'triaged', label: 'Under Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
  { key: 'declined', label: 'Declined' },
];

interface Props {
  value: StatusTab;
  onChange: (v: StatusTab) => void;
  counts: Record<StatusTab, number>;
}

export function AdminTicketStatusTabs({ value, onChange, counts }: Props) {
  return (
    <div className="border-b flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              active
                ? 'border-[#7130A0] text-[#7130A0]'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className={cn('ml-1.5 text-xs', active ? 'text-[#7130A0]' : 'text-muted-foreground/70')}>
              ({counts[t.key] ?? 0})
            </span>
          </button>
        );
      })}
    </div>
  );
}
