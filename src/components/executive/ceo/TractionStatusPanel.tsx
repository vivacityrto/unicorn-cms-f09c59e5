/**
 * TractionStatusPanel – CEO Dashboard Panel A
 * Rocks breakdown: On Track / At Risk / Off Track / Complete
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { RockStats } from '@/hooks/useCeoDashboard';

interface Props {
  stats: RockStats | undefined;
  isLoading: boolean;
}

function StatusDot({ color }: { color: string }) {
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full', color)} />;
}

export function TractionStatusPanel({ stats, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading || !stats) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Traction Status</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  const items = [
    { label: 'On Track', value: stats.on_track, dot: 'bg-green-500' },
    { label: 'At Risk', value: stats.at_risk, dot: 'bg-[hsl(var(--brand-macaron))]' },
    { label: 'Off Track', value: stats.off_track, dot: 'bg-[hsl(var(--brand-fuchsia))]' },
    { label: 'Complete', value: stats.complete, dot: 'bg-[hsl(var(--brand-purple))]' },
    { label: 'Not Started', value: stats.not_started, dot: 'bg-muted-foreground' },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">Traction Status</CardTitle>
              <span className="text-xs text-muted-foreground ml-1">{stats.total} Rocks</span>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-3">
              {items.map(item => (
                <div key={item.label} className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    <StatusDot color={item.dot} />
                    <span className="text-xl font-bold text-foreground tabular-nums">{item.value}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
