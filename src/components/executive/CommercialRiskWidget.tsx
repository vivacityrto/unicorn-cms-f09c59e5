/**
 * CommercialRiskWidget – Unicorn 2.0 Phase 15
 * Executive dashboard widget showing retention risk distribution and revenue exposure.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, DollarSign } from 'lucide-react';
import { useRetentionOverview } from '@/hooks/useRetentionForecast';

export function CommercialRiskWidget() {
  const { data, isLoading } = useRetentionOverview();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Commercial Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No retention data available.</p>
        </CardContent>
      </Card>
    );
  }

  const pct = (n: number) =>
    data.total > 0 ? Math.round((n / data.total) * 100) : 0;

  const bars = [
    { label: 'Stable', count: data.stable, pct: pct(data.stable), color: 'bg-green-500' },
    { label: 'Watch', count: data.watch, pct: pct(data.watch), color: 'bg-yellow-500' },
    { label: 'Vulnerable', count: data.vulnerable, pct: pct(data.vulnerable), color: 'bg-orange-500' },
    { label: 'High Risk', count: data.high_risk, pct: pct(data.high_risk), color: 'bg-red-500' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> Commercial Risk Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Distribution bar */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {bars.map((b) => (
            <div
              key={b.label}
              className={b.color}
              style={{ width: `${Math.max(b.pct, b.count > 0 ? 4 : 0)}%` }}
              title={`${b.label}: ${b.count}`}
            />
          ))}
        </div>

        {/* Labels */}
        <div className="grid grid-cols-4 gap-1 text-center">
          {bars.map((b) => (
            <div key={b.label}>
              <p className="text-sm font-bold">{b.count}</p>
              <p className="text-[9px] text-muted-foreground">{b.label}</p>
            </div>
          ))}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
          <div>
            <p className="text-muted-foreground">Renewals ≤90d</p>
            <p className="font-semibold">{data.within_renewal_90}</p>
          </div>
          <div>
            <p className="text-muted-foreground">High Risk in Window</p>
            <p className="font-semibold text-red-600">{data.high_risk_in_renewal}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">Revenue Exposure (6mo)</p>
            <p className="font-semibold text-red-600">
              ${data.revenue_at_risk.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
