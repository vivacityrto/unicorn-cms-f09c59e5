import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { RiskCluster } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  clusters: RiskCluster[];
}

const trendIcon = {
  rising: TrendingUp,
  falling: TrendingDown,
  stable: Minus,
};

const trendColor = {
  rising: 'text-destructive',
  falling: 'text-emerald-500',
  stable: 'text-muted-foreground',
};

export function RiskClusterSnapshot({ clusters }: Props) {
  const top3 = clusters.slice(0, 3);

  if (top3.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Risk Cluster Snapshot</h2>
          <p className="text-xs text-muted-foreground">Top flagged Standards 2025 clauses</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {top3.map(cluster => {
          const TrendIcon = trendIcon[cluster.trend as keyof typeof trendIcon] || Minus;
          const tColor = trendColor[cluster.trend as keyof typeof trendColor] || 'text-muted-foreground';
          return (
            <Card key={cluster.standard_clause} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-bold text-foreground">{cluster.standard_clause}</p>
                  <TrendIcon className={cn('h-4 w-4 shrink-0 mt-0.5', tColor)} />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{cluster.tenant_count} tenants</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{cluster.total_events} events</span>
                </div>
                {cluster.has_regulator_overlap && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Regulator overlap</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
