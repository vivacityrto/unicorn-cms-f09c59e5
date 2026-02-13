/**
 * RiskCapacityPanel – CEO Dashboard Panel F
 * Active/High risks from risk_flags
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { RiskCapacityStats } from '@/hooks/useCeoDashboard';

interface Props {
  stats: RiskCapacityStats | undefined;
  isLoading: boolean;
}

export function RiskCapacityPanel({ stats, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading || !stats) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Risk &amp; Capacity</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">Risk &amp; Capacity</CardTitle>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{stats.activeRisks}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Risks</p>
              </div>
              <div className="text-center">
                <p className={cn(
                  'text-2xl font-bold tabular-nums',
                  stats.highRisks > 0 ? 'text-[hsl(var(--brand-fuchsia))]' : 'text-green-600'
                )}>
                  {stats.highRisks}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">High / Critical</p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
