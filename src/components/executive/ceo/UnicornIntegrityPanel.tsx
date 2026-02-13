/**
 * UnicornIntegrityPanel – CEO Dashboard Panel D
 * System health: overdue tasks, audit events
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Database, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { IntegrityStats } from '@/hooks/useCeoDashboard';

interface Props {
  stats: IntegrityStats | undefined;
  isLoading: boolean;
}

export function UnicornIntegrityPanel({ stats, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading || !stats) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Unicorn Integrity</CardTitle></CardHeader>
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
              <Database className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">Unicorn Integrity</CardTitle>
              {stats.overdue7dCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--brand-fuchsia))]">
                  <AlertTriangle className="w-3 h-3" /> {stats.overdue7dCount} critical
                </span>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className={cn(
                  'text-2xl font-bold tabular-nums',
                  stats.overdueTaskCount > 0 ? 'text-[hsl(var(--brand-macaron))]' : 'text-green-600'
                )}>
                  {stats.overdueTaskCount}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overdue Tasks</p>
              </div>
              <div className="text-center">
                <p className={cn(
                  'text-2xl font-bold tabular-nums',
                  stats.overdue7dCount > 0 ? 'text-[hsl(var(--brand-fuchsia))]' : 'text-foreground'
                )}>
                  {stats.overdue7dCount}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{'> 7 Days'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{stats.recentAuditEvents}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Audit Events (7d)</p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
