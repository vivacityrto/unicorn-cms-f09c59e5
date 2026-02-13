/**
 * CeoReliefPanel – CEO Dashboard Panel C
 * Delegation index and operational load
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { CeoReliefStats } from '@/hooks/useCeoDashboard';

interface Props {
  stats: CeoReliefStats | null | undefined;
  isLoading: boolean;
}

export function CeoReliefPanel({ stats, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading || !stats) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">CEO Relief Index</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  const reliefColor = stats.delegationPct >= 80 ? 'text-green-600' : stats.delegationPct >= 60 ? 'text-[hsl(var(--brand-macaron))]' : 'text-[hsl(var(--brand-fuchsia))]';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">CEO Relief Index</CardTitle>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className={cn('text-2xl font-bold tabular-nums', reliefColor)}>{stats.delegationPct}%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Delegated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{stats.ceoOwnedTodos}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CEO Owned</p>
              </div>
              <div className="text-center">
                <p className={cn('text-2xl font-bold tabular-nums', stats.overdueCount > 0 ? 'text-[hsl(var(--brand-fuchsia))]' : 'text-foreground')}>
                  {stats.overdueCount}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overdue</p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
