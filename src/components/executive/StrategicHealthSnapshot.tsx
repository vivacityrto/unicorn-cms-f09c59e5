/**
 * StrategicHealthSnapshot – Unicorn 2.0
 *
 * Portfolio health status: band counts with 7-day movement.
 */

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface StrategicHealthSnapshotProps {
  data: ExecutiveHealthRow[];
  weeklyMode: boolean;
}

interface BandBlock {
  key: string;
  label: string;
  filterFn: (r: ExecutiveHealthRow) => boolean;
  intent: string;
}

const BANDS: BandBlock[] = [
  {
    key: 'immediate',
    label: 'Immediate Attention',
    filterFn: r => r.risk_band === 'immediate_attention',
    intent: 'border-l-4 border-l-[hsl(333,86%,51%)]', // Fuchsia
  },
  {
    key: 'at_risk',
    label: 'At Risk',
    filterFn: r => r.risk_band === 'at_risk',
    intent: 'border-l-4 border-l-[hsl(48,96%,52%)]', // Macaron
  },
  {
    key: 'stable',
    label: 'Stable',
    filterFn: r => r.risk_band === 'stable' || r.risk_band === 'watch',
    intent: 'border-l-4 border-l-[hsl(275,55%,41%)]', // Purple
  },
  {
    key: 'stalled',
    label: 'Stalled >14d',
    filterFn: r => r.days_stale > 14,
    intent: 'border-l-4 border-l-[hsl(190,74%,50%)]', // Aqua
  },
];

function getDeltaText(current: number, delta: number): string {
  if (delta === 0) return 'No change';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} this week`;
}

export function StrategicHealthSnapshot({ data, weeklyMode }: StrategicHealthSnapshotProps) {
  // Calculate 7d deltas by checking risk_band_change_7d and movement
  const counts = BANDS.map(band => {
    const matching = data.filter(band.filterFn);
    const count = matching.length;

    // Estimate 7d delta: count how many moved INTO this state
    let delta = 0;
    if (band.key === 'immediate') {
      delta = data.filter(r => r.risk_band === 'immediate_attention' && r.risk_band_change_7d === 'changed').length;
    } else if (band.key === 'at_risk') {
      delta = data.filter(r => r.risk_band === 'at_risk' && r.risk_band_change_7d === 'changed').length;
    } else if (band.key === 'stalled') {
      delta = data.filter(r => r.days_stale > 14 && r.delta_days_stale_7d > 0).length;
    }

    return { ...band, count, delta };
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {counts.map(b => (
        <Card key={b.key} className={cn('bg-card', b.intent)}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{b.label}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{weeklyMode && b.delta !== 0 ? `${b.delta > 0 ? '+' : ''}${b.delta}` : b.count}</p>
            {!weeklyMode && (
              <p className={cn(
                'text-xs mt-1',
                b.delta > 0 ? 'text-[hsl(333,86%,51%)]' : 'text-muted-foreground'
              )}>
                {getDeltaText(b.count, b.delta)}
              </p>
            )}
            {weeklyMode && (
              <p className="text-xs text-muted-foreground mt-1">
                {b.count} total
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
