/**
 * OwnerPressureTable – Unicorn 2.0
 *
 * Compact consultant load and exposure distribution.
 * "Nova's tool" — no ranking, no scores, just load visibility.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import type { ConsultantDistRow } from '@/hooks/useExecutiveData';

interface OwnerPressureTableProps {
  data: ConsultantDistRow[];
  isLoading: boolean;
}

export function OwnerPressureTable({ data, isLoading }: OwnerPressureTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Owner Pressure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...data].sort((a, b) => {
    if (b.immediate_count !== a.immediate_count) return b.immediate_count - a.immediate_count;
    return b.at_risk_count - a.at_risk_count;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Owner Pressure
        </CardTitle>
        <p className="text-xs text-muted-foreground">Load and exposure distribution</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Consultant</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">Immediate</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">At Risk</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">Stalled</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.consultant_uuid} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground text-xs truncate max-w-[140px]">{c.consultant_name}</td>
                  <td className={cn('px-2 py-2 text-center tabular-nums text-xs font-semibold', c.immediate_count > 0 ? 'text-[hsl(333,86%,51%)]' : 'text-muted-foreground')}>
                    {c.immediate_count}
                  </td>
                  <td className={cn('px-2 py-2 text-center tabular-nums text-xs font-semibold', c.at_risk_count > 0 ? 'text-[hsl(48,96%,52%)]' : 'text-muted-foreground')}>
                    {c.at_risk_count}
                  </td>
                  <td className={cn('px-2 py-2 text-center tabular-nums text-xs', c.stalled_count > 0 ? 'text-[hsl(190,74%,50%)] font-semibold' : 'text-muted-foreground')}>
                    {c.stalled_count}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-xs">No consultant data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
