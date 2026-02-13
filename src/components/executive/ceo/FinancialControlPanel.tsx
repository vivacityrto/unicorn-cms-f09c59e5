/**
 * FinancialControlPanel – CEO Dashboard Panel E
 * Xero reconciliation, payroll, balances
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { FinancialControlRow } from '@/hooks/useCeoDashboard';

interface Props {
  controls: FinancialControlRow[] | undefined;
  isLoading: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: 'bg-green-100 text-green-700',
    pending: 'bg-[hsl(var(--brand-macaron))]/10 text-[hsl(var(--brand-macaron))]',
    overdue: 'bg-[hsl(var(--brand-fuchsia))]/10 text-[hsl(var(--brand-fuchsia))]',
    flagged: 'bg-[hsl(var(--brand-fuchsia))]/10 text-[hsl(var(--brand-fuchsia))]',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium uppercase', colors[status] ?? 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  );
}

export function FinancialControlPanel({ controls, isLoading }: Props) {
  const [open, setOpen] = useState(true);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Financial Control</CardTitle></CardHeader>
        <CardContent className="h-24" />
      </Card>
    );
  }

  const rows = controls ?? [];
  const hasIssues = rows.some(r => r.status === 'overdue' || r.status === 'flagged');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(hasIssues && 'ring-1 ring-[hsl(var(--brand-fuchsia))]/30')}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[hsl(var(--brand-purple))]" />
              <CardTitle className="text-sm">Financial Control</CardTitle>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No financial controls configured yet.</p>
            ) : (
              <div className="space-y-2">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground capitalize">{row.control_type.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      {row.amount_outstanding > 0 && (
                        <span className="text-muted-foreground tabular-nums">${row.amount_outstanding.toLocaleString()}</span>
                      )}
                      <StatusBadge status={row.status} />
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
