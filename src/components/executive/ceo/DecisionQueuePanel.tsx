/**
 * DecisionQueuePanel – CEO Dashboard Panel H
 * Items requiring CEO decision with aging indicators
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Inbox, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRBAC } from '@/hooks/useRBAC';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { DecisionQueueRow } from '@/hooks/useCeoDashboard';

interface Props {
  items: DecisionQueueRow[] | undefined;
  isLoading: boolean;
}

function AgingBadge({ days }: { days: number }) {
  if (days >= 5) return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[hsl(var(--brand-macaron))]/10 text-[hsl(var(--brand-macaron))] tabular-nums">{days}d</span>;
  return <span className="text-[10px] text-muted-foreground tabular-nums">{days}d</span>;
}

function ImpactBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-[hsl(var(--brand-fuchsia))]/10 text-[hsl(var(--brand-fuchsia))]',
    high: 'bg-[hsl(var(--brand-macaron))]/10 text-[hsl(var(--brand-macaron))]',
    medium: 'bg-[hsl(var(--brand-aqua))]/10 text-[hsl(var(--brand-aqua))]',
    low: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium uppercase', colors[level] ?? 'bg-muted text-muted-foreground')}>
      {level}
    </span>
  );
}

export function DecisionQueuePanel({ items, isLoading }: Props) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const { isSuperAdmin } = useRBAC();
  const rows = items ?? [];

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">CEO Decision Queue</CardTitle></CardHeader>
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
              <Inbox className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">CEO Decision Queue</CardTitle>
              {isSuperAdmin && (
                <button onClick={e => { e.stopPropagation(); navigate('/executive/decision-queue'); }} className="p-1 rounded hover:bg-muted transition-colors" title="Manage Decision Queue">
                  <Settings2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
              {rows.length > 0 && (
                <span className="text-xs text-muted-foreground">{rows.length} pending</span>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No pending decisions. All clear.</p>
            ) : (
              <div className="space-y-2">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-foreground truncate flex-1">{row.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <ImpactBadge level={row.impact_level} />
                      <AgingBadge days={row.days_pending} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
