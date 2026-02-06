import { 
  CalendarDays, Clock, Link, CheckCircle2, List 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MeetingFilter } from '@/hooks/useMeetings';
import { cn } from '@/lib/utils';

interface MeetingsFiltersProps {
  filter: MeetingFilter;
  onFilterChange: (filter: MeetingFilter) => void;
  stats: {
    total: number;
    needsLinking: number;
    noTimeDraft: number;
    completed: number;
    upcoming: number;
  };
}

export function MeetingsFilters({ filter, onFilterChange, stats }: MeetingsFiltersProps) {
  const filters: Array<{
    value: MeetingFilter;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    highlight?: boolean;
  }> = [
    { value: 'all', label: 'All', icon: List, count: stats.total },
    { value: 'this_week', label: 'This week', icon: CalendarDays, count: stats.upcoming },
    { value: 'needs_linking', label: 'Needs linking', icon: Link, count: stats.needsLinking, highlight: stats.needsLinking > 0 },
    { value: 'no_time_draft', label: 'No time draft', icon: Clock, count: stats.noTimeDraft, highlight: stats.noTimeDraft > 0 },
    { value: 'completed', label: 'Completed', icon: CheckCircle2, count: stats.completed },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map(({ value, label, icon: Icon, count, highlight }) => (
        <Button
          key={value}
          variant={filter === value ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'gap-2',
            highlight && filter !== value && 'border-amber-300 text-amber-600 hover:bg-amber-50'
          )}
          onClick={() => onFilterChange(value)}
        >
          <Icon className="h-4 w-4" />
          {label}
          {count !== undefined && count > 0 && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              filter === value 
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : highlight 
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-muted text-muted-foreground'
            )}>
              {count}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}
