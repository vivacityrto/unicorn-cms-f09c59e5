/**
 * DiamondClientPanel – CEO Dashboard Panel G
 * Diamond-tier client commitments due within 14 days
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Gem, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { format } from 'date-fns';

interface Props {
  data: { upcoming: any[]; atRisk: number; missed: number } | undefined;
  isLoading: boolean;
}

export function DiamondClientPanel({ data, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Diamond Clients</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  const hasMissed = (data?.missed ?? 0) > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(hasMissed && 'ring-1 ring-[hsl(var(--brand-fuchsia))]/30')}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Gem className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">Diamond Clients</CardTitle>
              {hasMissed && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--brand-fuchsia))]">
                  <AlertTriangle className="w-3 h-3" /> {data!.missed} missed
                </span>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!data || (data.upcoming.length === 0 && data.atRisk === 0 && data.missed === 0) ? (
              <p className="text-xs text-muted-foreground italic">No diamond commitments due in the next 14 days.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className={cn('text-xl font-bold tabular-nums', data.atRisk > 0 ? 'text-[hsl(var(--brand-macaron))]' : 'text-foreground')}>
                      {data.atRisk}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">At Risk</p>
                  </div>
                  <div className="text-center">
                    <p className={cn('text-xl font-bold tabular-nums', data.missed > 0 ? 'text-[hsl(var(--brand-fuchsia))]' : 'text-foreground')}>
                      {data.missed}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Missed</p>
                  </div>
                </div>
                {data.upcoming.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Upcoming</p>
                    {data.upcoming.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground truncate max-w-[60%]">{c.title}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {c.due_date ? format(new Date(c.due_date), 'dd MMM') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
