/**
 * WatchlistPanel – Unicorn 2.0
 *
 * Shows threshold crossings in the last 7 days.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import type { WatchlistItem, ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface WatchlistPanelProps {
  watchlist: WatchlistItem[];
  healthData: ExecutiveHealthRow[];
  onItemClick: (row: ExecutiveHealthRow) => void;
}

const changeLabels: Record<string, string> = {
  compliance_drop: 'Compliance dropped',
  risk_band_worsened: 'Risk band worsened',
  predictive_spike: 'Risk score spiked',
  newly_stale: 'Became stale',
};

export function WatchlistPanel({ watchlist, healthData, onItemClick }: WatchlistPanelProps) {
  if (watchlist.length === 0) return null;

  const getClient = (item: WatchlistItem) =>
    healthData.find(r => r.tenant_id === item.tenant_id && r.package_instance_id === item.package_instance_id);

  return (
    <Card className="border-brand-fuchsia-200 dark:border-brand-fuchsia-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-brand-fuchsia-600" />
          Changed in Last 7 Days
        </CardTitle>
        <p className="text-xs text-muted-foreground">{watchlist.length} threshold crossings detected</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[240px] overflow-y-auto">
          {watchlist.map((item, i) => {
            const client = getClient(item);
            return (
              <button
                key={`${item.tenant_id}-${item.package_instance_id}-${item.change_type}-${i}`}
                className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors text-left"
                onClick={() => client && onItemClick(client)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {client?.client_name ?? `Tenant ${item.tenant_id}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {changeLabels[item.change_type] ?? item.change_type}
                    {item.baseline_value != null && item.current_value != null && (
                      <span> · {item.baseline_value} → {item.current_value}</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
