import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface PeriodOption {
  id: string;
  label: string;
  dateFrom: Date;
  dateTo: Date | undefined;
}

interface PeriodSelectorProps {
  packageInstanceId: number;
  value: string;
  onChange: (value: string, range: { dateFrom: Date | undefined; dateTo: Date | undefined }) => void;
  triggerClassName?: string;
}

const DEFAULT_TRIGGER_CLASSNAME = 'h-8 text-xs min-w-[220px] rounded-full border-primary text-primary bg-background hover:bg-primary/10';

export const ALL_TIME_VALUE = 'all-time';

/** Only meaningful for a single package instance - periods belong to one
 *  instance each, so there's no clean combined "period" across a multi-
 *  package selection. Answers "which period am I looking at" explicitly,
 *  replacing the old vague derived-date-range "Current period / Show all"
 *  toggle. */
export function PeriodSelector({ packageInstanceId, value, onChange, triggerClassName }: PeriodSelectorProps) {
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['package-renewal-periods', packageInstanceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('package_renewal_periods')
        .select('period_number, period_start, period_end, closed_at')
        .eq('package_instance_id', packageInstanceId)
        .order('period_number', { ascending: false });
      if (error) throw error;
      return (data || []) as { period_number: number; period_start: string; period_end: string; closed_at: string | null }[];
    },
    enabled: !!packageInstanceId,
    staleTime: 60_000,
  });

  // Nothing to choose between until there's been at least one renewal -
  // a single period with an "All time" option that means the same thing
  // is a pointless control, not a real filter.
  if (isLoading || periods.length <= 1) return null;

  const options: PeriodOption[] = periods.map(p => ({
    id: String(p.period_number),
    label: `${p.closed_at ? 'Period' : 'Current period'} ${p.period_number}: ${format(new Date(p.period_start), 'd MMM yyyy')} – ${format(new Date(p.period_end), 'd MMM yyyy')}`,
    dateFrom: new Date(p.period_start),
    dateTo: new Date(p.period_end),
  }));

  const handleChange = (id: string) => {
    if (id === ALL_TIME_VALUE) {
      onChange(id, { dateFrom: undefined, dateTo: undefined });
      return;
    }
    const opt = options.find(o => o.id === id);
    onChange(id, { dateFrom: opt?.dateFrom, dateTo: opt?.dateTo });
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className={cn(triggerClassName ?? DEFAULT_TRIGGER_CLASSNAME)}>
        <SelectValue placeholder="Select period" />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.id} value={o.id} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
        <SelectItem value={ALL_TIME_VALUE} className="text-xs">
          All time
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
