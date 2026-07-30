import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOverflowTabs } from '@/hooks/useOverflowTabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
      {count}
    </span>
  );
}

export function AdminTicketStatusTabs({ value, onChange, counts }: Props) {
  // As many tabs as fit render directly; the rest collapse into a "More"
  // dropdown - measured dynamically so widening the window reveals more
  // tabs instead of a fixed split. See useOverflowTabs and
  // feedback_no_tab_scroll: horizontal scroll is not used for tab overflow
  // anywhere in this app.
  const { containerRef, itemRef, moreMeasureRef, activeMoreMeasureRef, visibleCount } = useOverflowTabs(TABS.length, 0);
  const visibleTabs = TABS.slice(0, visibleCount);
  const moreTabs = TABS.slice(visibleCount);
  const activeMoreTab = moreTabs.find((t) => t.key === value);

  return (
    <div ref={containerRef} className="border-b border-gray-200 px-6 flex items-center gap-0 min-w-0">
      {visibleTabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium cursor-pointer whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center',
              active
                ? 'text-[#7130A0] border-[#7130A0]'
                : 'text-gray-500 hover:text-gray-700 border-transparent',
            )}
          >
            {t.label}
            <CountBadge count={counts[t.key] ?? 0} />
          </button>
        );
      })}

      {moreTabs.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'px-4 py-3 text-sm font-medium cursor-pointer whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center gap-1 shrink-0',
                activeMoreTab
                  ? 'text-[#7130A0] border-[#7130A0]'
                  : 'text-gray-500 hover:text-gray-700 border-transparent',
              )}
            >
              {activeMoreTab ? (
                <>
                  {activeMoreTab.label}
                  <CountBadge count={counts[activeMoreTab.key] ?? 0} />
                </>
              ) : (
                'More'
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {moreTabs.map((t) => (
              <DropdownMenuItem
                key={t.key}
                onClick={() => onChange(t.key)}
                className={cn(value === t.key && 'font-semibold bg-accent')}
              >
                {t.label}
                <CountBadge count={counts[t.key] ?? 0} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Hidden measurement clones — never shown, kept in sync with the
          real markup above so the width-measurement effect stays accurate. */}
      <div aria-hidden className="absolute invisible h-0 overflow-hidden flex items-center pointer-events-none">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={itemRef(i) as React.Ref<HTMLButtonElement>}
            type="button"
            tabIndex={-1}
            className="px-4 py-3 text-sm font-medium whitespace-nowrap inline-flex items-center"
          >
            {t.label}
            <CountBadge count={counts[t.key] ?? 0} />
          </button>
        ))}
        <button
          ref={moreMeasureRef as React.Ref<HTMLButtonElement>}
          type="button"
          tabIndex={-1}
          className="px-4 py-3 text-sm font-medium inline-flex items-center gap-1"
        >
          More <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {TABS.map((t, i) => (
          <button
            key={`more-${t.key}`}
            ref={activeMoreMeasureRef(i) as React.Ref<HTMLButtonElement>}
            type="button"
            tabIndex={-1}
            className="px-4 py-3 text-sm font-medium inline-flex items-center gap-1"
          >
            {t.label}
            <CountBadge count={counts[t.key] ?? 0} />
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
