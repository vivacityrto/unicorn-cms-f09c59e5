import { cn } from '@/lib/utils';

export type StatusTab = 'active' | 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed' | 'declined';

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'new', label: 'New' },
  { key: 'triaged', label: 'Under Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed (All)' },
  { key: 'declined', label: 'Declined' },
];

interface Props {
  value: StatusTab;
  onChange: (v: StatusTab) => void;
  counts: Record<StatusTab, number>;
}

export function AdminTicketStatusTabs({ value, onChange, counts }: Props) {
  return (
    <div className="border-b border-gray-200 px-6 flex gap-0 overflow-x-auto scrollbar-thin">
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium cursor-pointer whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center',
              active
                ? 'text-[#7130A0] border-[#7130A0]'
                : 'text-gray-500 hover:text-gray-700 border-transparent',
            )}
          >
            {t.label}
            <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
              {counts[t.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
